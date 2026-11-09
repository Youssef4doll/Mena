"use server";

import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { translationReady } from "@/lib/translate";
import { researchBenchmarks, reviewCreatives, type Picture } from "@/lib/ads/forecast-ai";
import { forecastEnv, readBenchmarks, saveBenchmarks, tickBenchmarks, type BenchStore, type StoredForecast } from "@/lib/ads/forecast-data";
import { readBenchReply, toBenchmarks, type ReviewResult } from "@/lib/ads/forecast-prompt";
import { buildForecast, PlanInput, type ForecastEnv, type ForecastResult } from "@/lib/ads/forecast-plan";
import type { BriefInput } from "@/lib/ads/brief";
import { loadBriefInput } from "@/lib/ads/brief-data";

/**
 * The "Prévision" tab's server side. The product's facts, costs and the
 * shop's measures are read again from the database for every forecast: the
 * browser sends the plan (budgets, days, which ad goes where) and Claude's
 * grades, never a price, a cost or a rate. Claude runs here only with the
 * API key; without it the tab copies the requests for claude.ai.
 */

type Fail = { ok: false; error: string };
const productId = z.string().regex(/^[a-z0-9]{20,40}$/);

function aiError(e: unknown): Fail {
  if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "La clé ANTHROPIC_API_KEY est refusée : vérifiez-la dans Vercel, ou copiez la demande pour claude.ai." };
  if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Trop de demandes d'un coup : réessayez dans une minute." };
  if (e instanceof Anthropic.APIError) return { ok: false, error: "Le service ne répond pas pour le moment. Réessayez plus tard, ou copiez la demande pour claude.ai." };
  return { ok: false, error: e instanceof Error ? e.message : "Impossible pour le moment." };
}

const NO_KEY: Fail = { ok: false, error: "Sans clé ANTHROPIC_API_KEY dans Vercel : copiez la demande pour claude.ai." };

export type ProductData = { input: BriefInput; photos: string[]; offers: ForecastEnv["offers"]; shop: ForecastEnv["shop"]; optimized: ForecastEnv["optimized"] };

/** One product's facts, photos, offers and the shop's measures, for the picker. */
export async function forecastProduct(id: string): Promise<{ ok: true; data: ProductData } | Fail> {
  await requireAdmin();
  const parsed = productId.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Produit introuvable." };
  const r = await forecastEnv(parsed.data);
  if (!r) return { ok: false, error: "Produit introuvable : il a peut-être été supprimé." };
  return { ok: true, data: { input: r.input, photos: r.photos, offers: r.env.offers, shop: r.env.shop, optimized: r.env.optimized } };
}

// ── Public figures ─────────────────────────────────────────────────────

/** Claude searches the web; only the pages its own tools returned count as checked. */
export async function searchFigures(): Promise<{ ok: true; store: BenchStore } | Fail> {
  await requireAdmin();
  if (!translationReady()) return NO_KEY;
  try {
    const { answer, seen } = await researchBenchmarks();
    const store: BenchStore = { updatedAt: new Date().toISOString(), mode: "api", items: toBenchmarks(answer, seen) };
    await saveBenchmarks(store);
    revalidatePath("/admin/publicites/prevision");
    return { ok: true, store };
  } catch (e) {
    return aiError(e);
  }
}

/** claude.ai's reply, pasted: every figure is "to check" until the owner ticks it. */
export async function pasteFigures(reply: string): Promise<{ ok: true; store: BenchStore } | Fail> {
  await requireAdmin();
  const answer = typeof reply === "string" ? readBenchReply(reply) : null;
  if (!answer) return { ok: false, error: "Réponse illisible : collez toute la réponse de claude.ai, avec ses accolades { }." };
  const items = toBenchmarks(answer, null);
  if (!items.length) return { ok: false, error: "Aucun chiffre utilisable dans cette réponse (un pourcentage, un prix avec son taux de change, ou le nombre d'événements de Meta)." };
  const store: BenchStore = { updatedAt: new Date().toISOString(), mode: "manual", items };
  await saveBenchmarks(store);
  revalidatePath("/admin/publicites/prevision");
  return { ok: true, store };
}

export async function tickFigures(ids: string[]): Promise<{ ok: true; store: BenchStore } | Fail> {
  await requireAdmin();
  const parsed = z.array(z.string().max(20)).max(200).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Choix illisible." };
  const store = await tickBenchmarks(parsed.data);
  return store ? { ok: true, store } : { ok: false, error: "Aucun chiffre public enregistré." };
}

export async function figures(): Promise<BenchStore | null> {
  await requireAdmin();
  return readBenchmarks();
}

// ── The creatives ──────────────────────────────────────────────────────

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
/** One picture at most (base64), and all of them: under the server's request limit. */
const PICTURE_MAX = 2_500_000;
const PICTURES_MAX = 8_500_000;

function picture(url: string): Picture | null {
  const m = DATA_URL.exec(url);
  return m && m[2].length <= PICTURE_MAX ? { media: m[1] as Picture["media"], data: m[2] } : null;
}

const Brief = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/),
  kind: z.enum(["video", "image"]),
  seconds: z.number().finite().min(0).max(3600).nullable(),
  ratio: z.string().max(20),
  primaryText: z.string().max(3000),
  headline: z.string().max(300),
  adSet: z.string().max(80),
});

/** Claude reads the creatives (one picture or frame sheet each) next to the product's photos. Nothing is saved. */
export async function reviewAds(id: string, creatives: unknown, photos: string[], sheets: string[]): Promise<{ ok: true; review: ReviewResult } | Fail> {
  await requireAdmin();
  if (!translationReady()) return NO_KEY;
  const pid = productId.safeParse(id);
  const list = z.array(Brief).min(1).max(12).safeParse(creatives);
  if (!pid.success || !list.success) return { ok: false, error: "Ajoutez au moins une publicité." };
  if (!Array.isArray(photos) || !Array.isArray(sheets) || sheets.length !== list.data.length || photos.length > 4) return { ok: false, error: "Chaque publicité a besoin de son image." };
  const total = [...photos, ...sheets].reduce((s, u) => s + (typeof u === "string" ? u.length : 0), 0);
  if (total > PICTURES_MAX) return { ok: false, error: "Images trop lourdes : envoyez moins de publicités à la fois." };
  const ph = photos.map(picture);
  const sh = sheets.map(picture);
  if (ph.some((p) => !p) || sh.some((p) => !p)) return { ok: false, error: "Une image est illisible : rajoutez la publicité." };
  const input = await loadBriefInput(pid.data);
  if (!input) return { ok: false, error: "Produit introuvable." };
  try {
    return { ok: true, review: await reviewCreatives(input, list.data, ph as Picture[], sh as Picture[]) };
  } catch (e) {
    return aiError(e);
  }
}

// ── The forecast ───────────────────────────────────────────────────────

export async function runForecast(plan: unknown): Promise<{ ok: true; result: ForecastResult } | Fail> {
  await requireAdmin();
  const parsed = PlanInput.safeParse(plan);
  if (!parsed.success) return { ok: false, error: "Plan incomplet : vérifiez les budgets, les jours et la date de début." };
  const env = await forecastEnv(parsed.data.productId);
  if (!env) return { ok: false, error: "Produit introuvable." };
  const result = buildForecast(env.env, parsed.data);
  return "error" in result ? { ok: false, error: result.error } : { ok: true, result };
}

/** The review as kept with a saved forecast: the grades and reasons, without the pictures. */
const SavedReview = z.unknown();

/** Saves the plan and what the server forecasts for it (computed again here), to compare with the real results later. */
export async function saveForecast(plan: unknown, review: unknown, mode: "api" | "manual"): Promise<{ ok: true; id: string } | Fail> {
  await requireAdmin();
  const parsed = PlanInput.safeParse(plan);
  if (!parsed.success) return { ok: false, error: "Plan incomplet." };
  const env = await forecastEnv(parsed.data.productId);
  if (!env) return { ok: false, error: "Produit introuvable." };
  const r = buildForecast(env.env, parsed.data);
  if ("error" in r) return { ok: false, error: r.error };
  const names = [...new Set(parsed.data.creatives.map((c) => c.adName.trim()).filter(Boolean))];
  if (!names.length) return { ok: false, error: "Donnez un nom à chaque publicité, le même que dans le gestionnaire : c'est ainsi que les résultats réels se retrouvent." };
  const m = r.sim.metrics;
  const forecast: StoredForecast = { ...r.saved, orders: m.orders, delivered: m.delivered, costPerDelivered: m.costPerDelivered, profit: m.profit, probProfit: r.sim.probProfit, daily: r.daily, total: r.total };
  const kept = SavedReview.parse(review);
  if (JSON.stringify(kept ?? null).length > 200_000) return { ok: false, error: "Lecture des publicités trop longue pour être gardée." };
  const row = await prisma.adForecast.create({
    data: {
      productId: parsed.data.productId,
      productName: env.input.product.name,
      startDay: new Date(`${parsed.data.startDay}T00:00:00Z`),
      days: parsed.data.days,
      campaign: parsed.data.campaign || null,
      adNames: names,
      mode: mode === "api" ? "api" : "manual",
      plan: JSON.parse(JSON.stringify({ ...parsed.data, review: kept ?? null, figures: env.env.benchmarks.filter((b) => b.used).map((b) => b.id) })),
      // Infinity (a draw without an order) does not go into JSON: kept as null.
      forecast: JSON.parse(JSON.stringify(forecast, (_k, v) => (typeof v === "number" && !Number.isFinite(v) ? null : v))),
    },
  });
  revalidatePath("/admin/publicites/prevision");
  return { ok: true, id: row.id };
}

export async function removeForecast(id: string): Promise<{ ok: true } | Fail> {
  await requireAdmin();
  if (!/^[a-z0-9]{20,40}$/.test(id)) return { ok: false, error: "Prévision introuvable." };
  await prisma.adForecast.deleteMany({ where: { id } });
  revalidatePath("/admin/publicites/prevision");
  return { ok: true };
}
