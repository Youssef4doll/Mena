"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { refreshCatalog } from "@/lib/catalog-refresh";
import { translationReady } from "@/lib/translate";
import { PRODUCT_ID } from "@/lib/translate-batch";
import { researchProduct } from "@/lib/web-complete-ai";
import { WebReport, WebTexts, cleanTexts, type WebTexts as Texts } from "@/lib/web-complete-prompt";
import { readProductPage } from "@/lib/web-pages";
import { bigImageUrl, isImageUrl, videoAddress } from "@/lib/web-product";

/** What the web gave for one product, for the owner to choose from. Nothing of it is saved yet. */
export type Candidates = {
  pages: { url: string; title: string; sure: boolean }[];
  images: { url: string; from: string }[];
  videos: string[];
  /** Written by the AI from the pages (both languages); empty without it. */
  texts: Partial<Texts>;
  /** Without the AI: what the first readable page says of the product, to rewrite. */
  found: string;
  /** The pages that could not be read, and why. */
  notes: string[];
};

type Failure = { ok: false; error: string; stop: boolean };
type Found = { ok: true; candidates: Candidates } | Failure;

const MAX_PAGES = 6;
const MAX_CANDIDATES = 30;
const links = z.array(z.string().max(2000)).max(10);
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/**
 * The pages (the AI's and the owner's links) read by the server for their
 * large pictures and videos; the owner's direct photo addresses and the AI's
 * come first. Pages are read at the same time, each with its own limits.
 */
async function gather(report: WebReport, extra: string[]): Promise<Candidates> {
  const direct = [...extra.filter(isImageUrl), ...report.images.filter((u) => /^https:\/\//i.test(u))];
  const pageUrls = [...new Set([...extra.filter((u) => !isImageUrl(u)), ...report.pages.map((p) => p.url)])].filter((u) => /^https?:\/\//i.test(u)).slice(0, MAX_PAGES);
  const reads = await Promise.all(pageUrls.map(readProductPage));
  const images: Candidates["images"] = [];
  const seen = new Set<string>();
  const add = (url: string, from: string) => {
    const big = bigImageUrl(url);
    const key = big.replace(/\?.*$/, "");
    if (seen.has(key) || images.length >= MAX_CANDIDATES) return;
    seen.add(key);
    images.push({ url: big, from });
  };
  for (const u of direct) add(u, host(u));
  for (const r of reads) if (r.ok) for (const u of r.finds.images) add(u, host(r.url));
  const videos = [...new Set([report.video, ...reads.flatMap((r) => (r.ok ? r.finds.videos : []))].map((v) => (v ? videoAddress(v) : null)).filter((v): v is string => v != null))].slice(0, 6);
  const first = reads.find((r) => r.ok && (r.finds.bullets.length || r.finds.description));
  const found = first && first.ok ? [first.finds.description, first.finds.bullets.map((b) => `- ${b}`).join("\n")].filter(Boolean).join("\n\n") : "";
  const titles = new Map(reads.flatMap((r) => (r.ok ? [[r.url, r.finds.title] as const] : [])));
  const pages = pageUrls.map((url) => {
    const fromAi = report.pages.find((p) => p.url === url);
    return { url, title: fromAi?.title || titles.get(url) || host(url), sure: fromAi?.sure ?? extra.includes(url) };
  });
  const notes = reads.flatMap((r) => (r.ok ? [] : [`${host(r.url)} : ${r.error}`]));
  return { pages, images, videos, texts: cleanTexts(report.texts), found: found.slice(0, 4000), notes };
}

function failure(e: unknown): Failure {
  if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "La clé ANTHROPIC_API_KEY est refusée : vérifiez-la dans Vercel.", stop: true };
  if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Trop de recherches d'un coup : réessayez dans une minute.", stop: true };
  if (e instanceof Anthropic.APIError) return { ok: false, error: "L'IA ne répond pas pour le moment. Réessayez plus tard.", stop: true };
  return { ok: false, error: e instanceof Error ? e.message : "Recherche impossible.", stop: false };
}

const productSelect = { name: true, nameAr: true, summary: true, description: true, specs: true } as const;

/**
 * One product searched on the web by the AI (with the API key), plus the
 * owner's own links; without the key, only the owner's links are read.
 */
export async function searchProduct(id: string, rawLinks: string[]): Promise<Found> {
  await requireAdmin();
  if (typeof id !== "string" || !PRODUCT_ID.test(id)) return { ok: false, error: "Produit inconnu.", stop: false };
  const extra = links.safeParse(rawLinks);
  if (!extra.success) return { ok: false, error: "Dix liens au plus.", stop: false };
  const p = await prisma.product.findUnique({ where: { id }, select: productSelect });
  if (!p) return { ok: false, error: "Produit introuvable.", stop: false };
  let report: WebReport = { pages: [], images: [], video: "", texts: {} };
  if (translationReady()) {
    try {
      report = await researchProduct({ ref: "P1", name: p.name, nameAr: p.nameAr ?? "", summary: p.summary, description: p.description, specs: p.specs });
    } catch (e) {
      // The owner's links are still worth reading when the AI could not help.
      if (!extra.data.length) return failure(e);
    }
  } else if (!extra.data.length) return { ok: false, error: "Collez au moins un lien (une page du produit ou l'adresse d'une photo).", stop: false };
  return { ok: true, candidates: await gather(report, extra.data) };
}

/** An answer pasted from claude.ai (no API key): its pages are read the same way. */
export async function readReport(id: string, raw: unknown, rawLinks: string[]): Promise<Found> {
  await requireAdmin();
  if (typeof id !== "string" || !PRODUCT_ID.test(id)) return { ok: false, error: "Produit inconnu.", stop: false };
  const report = WebReport.safeParse(raw);
  const extra = links.safeParse(rawLinks);
  if (!report.success || !extra.success) return { ok: false, error: "Réponse illisible.", stop: false };
  return { ok: true, candidates: await gather(report.data, extra.data) };
}

const applySchema = z.object({ texts: WebTexts.partial(), video: z.string().max(500).nullable() });

/**
 * The texts and the video the owner kept, written into the product (the
 * photos go one by one through the editor's picture route). Only the fields
 * sent are changed.
 */
export async function applyToProduct(id: string, raw: { texts: Partial<Texts>; video: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  if (typeof id !== "string" || !PRODUCT_ID.test(id)) return { ok: false, error: "Produit inconnu." };
  const body = applySchema.safeParse(raw);
  if (!body.success) return { ok: false, error: "Envoi refusé." };
  const texts = cleanTexts(body.data.texts);
  const video = body.data.video?.trim() || null;
  if (video && !videoAddress(video)) return { ok: false, error: "Cette vidéo n'est pas acceptée (YouTube, Vimeo, TikTok, Instagram ou Facebook)." };
  if (!Object.keys(texts).length && !video) return { ok: true };
  const found = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!found) return { ok: false, error: "Produit introuvable." };
  await prisma.product.update({ where: { id }, data: { ...texts, ...(video ? { videoUrl: video } : {}), updatedAt: new Date() }, select: { id: true } });
  return { ok: true };
}

/** Once products were completed: their pages and the lists show it at once. */
export async function completionDone(ids: string[]): Promise<{ ok: true }> {
  await requireAdmin();
  const valid = Array.isArray(ids) ? ids.filter((i) => typeof i === "string" && PRODUCT_ID.test(i)).slice(0, 200) : [];
  await refreshCatalog(valid);
  revalidatePath("/admin/produits/qualite");
  revalidatePath("/admin/produits/completer");
  return { ok: true };
}
