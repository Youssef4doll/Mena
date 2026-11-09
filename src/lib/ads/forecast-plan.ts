import { z } from "zod";
import { formatTND } from "../money";
import { fmt } from "../viz";
import { BENCH_LABELS, BENCH_STAGE, MARKET_LABELS, VERDICTS, pickRanges, type Benchmark, type CreativeReview, type Market } from "./forecast-prompt";
import {
  FACTOR_MAX,
  FACTOR_MIN,
  RATE_STAGES,
  budgetOptions,
  calibrationFactors,
  creativeOutlook,
  simulate,
  stageDists,
  testPlan,
  type BudgetOption,
  type Calibration,
  type Count,
  type CreativeFactor,
  type CreativeOutlook,
  type Economics,
  type ForecastInputs,
  type OptimizedEvent,
  type Plan,
  type SavedForecast,
  type Simulation,
  type Stage,
  type TestPlan,
} from "./forecast-model";

/**
 * The forecast as the "Prévision" tab shows it: the owner's plan, the shop's
 * own measures, the public figures ticked, Claude's reading of the creatives
 * and the past forecasts' correction, turned into one result: what each
 * stage is believed to be and why, the plan's ranges, each creative's
 * outlook, the test budget, the plan at other budgets, the learning-phase
 * check, and the advice in plain French. Pure, so it is tested; the server
 * loads the inputs (forecast-data.ts) and never takes a number of the
 * forecast from the browser.
 *
 *   PlanInput                    the plan as the form sends it (zod)
 *   buildForecast(env, plan)     → ForecastResult
 */

// ── What the server knows ──────────────────────────────────────────────

/** One offer's money (breakeven.ts), for the plan's choice. */
export type OfferEcon = {
  key: string;
  label: string;
  units: number;
  price: number;
  revenue: number;
  productCost: number | null;
  margin: number | null;
  maxCostPerDelivered: number | null;
  maxCpa: number | null;
};

/** The shop's own measures, as counts, with what they cover. */
export type ShopMeasures = {
  days: number;
  cpm: { spend: number; impressions: number } | null;
  ctr: Count | null;
  landing: Count | null;
  orderRate: Count | null;
  /** The order rate is this product's own (its ad visits) or every Meta visit of the shop. */
  orderScope: "product" | "shop" | null;
  confirmRate: Count | null;
  deliveryRate: Count | null;
  /** Of the confirmed orders, the share shipped (breakeven.ts shippedShare). */
  shipped: number;
};

export type ForecastEnv = {
  offers: OfferEcon[];
  shop: ShopMeasures;
  benchmarks: Benchmark[];
  calibration: Calibration;
  optimized: OptimizedEvent;
  carrierPerParcel: number | null;
  returnPerParcel: number | null;
};

// ── The plan, as the form sends it ─────────────────────────────────────

const id = z.string().trim().regex(/^[A-Za-z0-9_-]{1,20}$/);
const text = (max: number) => z.string().trim().max(max);
const Review = z.object({
  verdict: z.enum(VERDICTS),
  ctrFactor: z.number().finite().transform((x) => Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, x))),
  convFactor: z.number().finite().transform((x) => Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, x))),
  confidence: z.enum(["high", "medium", "low"]),
});
export const CreativeInput = z.object({
  id,
  label: text(80),
  kind: z.enum(["video", "image"]),
  adName: text(120),
  primaryText: text(3000),
  headline: text(300),
  /** Claude's grades: only what the forecast uses (the full review stays in the browser and in the saved plan). */
  review: Review.nullable(),
});
export const PlanInput = z.object({
  productId: z.string().regex(/^[a-z0-9]{20,40}$/),
  offerKey: text(40),
  days: z.number().int().min(1).max(60),
  startDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Millimes; null: no cap. */
  maxLoss: z.number().int().min(0).max(100_000_000).nullable(),
  campaign: text(120),
  adSets: z
    .array(z.object({ id, name: text(80), creativeIds: z.array(id).max(12), dailyBudget: z.number().int().min(0).max(10_000_000) }))
    .min(1)
    .max(8),
  creatives: z.array(CreativeInput).max(12),
});
export type PlanInput = z.output<typeof PlanInput>;
export type CreativeInput = z.output<typeof CreativeInput>;

// ── The result ─────────────────────────────────────────────────────────

export const STAGE_LABELS: Record<Stage, string> = {
  cpm: "Coût pour 1 000 affichages",
  ctr: "Clics sur le lien par affichage",
  landing: "Visites par clic",
  orderRate: "Commandes par visite",
  confirmRate: "Commandes confirmées",
  deliveryRate: "Colis livrés",
};

export type StageRow = {
  stage: Stage;
  label: string;
  /** What the forecast uses: median and 90 % range. Null: missing. */
  value: { median: number; low: number; high: number } | null;
  basis: "shop" | "public" | "both" | null;
  /** The shop's own measure, in words. */
  shop: string | null;
  /** The public range used, its market and its pages. */
  public: { low: number; high: number; market: Market; marketLabel: string; sources: { title: string; url: string; checked: boolean }[] } | null;
  /** The correction past forecasts applied to the public range (×). */
  calibration: number | null;
};

export type CreativeRow = CreativeOutlook & { label: string; verdict: CreativeReview["verdict"] | null; ctrFactor: number; convFactor: number; reviewed: boolean };

export type Learning = { needed: number | null; source: { title: string; url: string; checked: boolean } | null; adSets: { id: string; name: string; p50: number }[]; ok: boolean | null };

export type ForecastResult = {
  offer: OfferEcon;
  stages: StageRow[];
  sim: Simulation;
  creatives: CreativeRow[];
  test: TestPlan | null;
  options: BudgetOption[];
  learning: Learning;
  advice: { tone: "good" | "warn" | "bad" | "info"; text: string }[];
  saved: SavedForecast;
  /** The plan's daily total and what it spends over its days. */
  daily: number;
  total: number;
};

const OPTIONS = [0.5, 0.75, 1, 1.5, 2, 3];

const money = (m: number | null | undefined) => (m == null || !Number.isFinite(m) ? "—" : formatTND(Math.round(m / 1000) * 1000).replace(",000 DT", " DT"));
const pct = (x: number | null | undefined) => fmt(x ?? null, "pct");
const count = (n: number) => Math.round(n).toLocaleString("fr-FR");

function shopText(stage: Stage, s: ShopMeasures): string | null {
  const d = `${s.days} jours`;
  switch (stage) {
    case "cpm":
      return s.cpm ? `${money((s.cpm.spend / s.cpm.impressions) * 1000)} sur ${count(s.cpm.impressions)} affichages Meta (${d})` : null;
    case "ctr":
      return s.ctr && s.ctr.n > 0 ? `${pct(s.ctr.successes / s.ctr.n)} : ${count(s.ctr.successes)} clics sur ${count(s.ctr.n)} affichages (${d})` : null;
    case "landing":
      return s.landing && s.landing.n > 0 ? `${pct(s.landing.successes / s.landing.n)} : ${count(s.landing.successes)} visites pour ${count(s.landing.n)} clics (${d})` : null;
    case "orderRate":
      return s.orderRate && s.orderRate.n > 0
        ? `${pct(s.orderRate.successes / s.orderRate.n)} : ${count(s.orderRate.successes)} commandes sur ${count(s.orderRate.n)} visites ${s.orderScope === "product" ? "de ce produit venues des publicités" : "venues des publicités Meta, tous produits"} (${d})`
        : null;
    case "confirmRate":
      return s.confirmRate && s.confirmRate.n > 0 ? `${pct(s.confirmRate.successes / s.confirmRate.n)} : ${count(s.confirmRate.successes)} sur ${count(s.confirmRate.n)} commandes appelées` : null;
    case "deliveryRate":
      return s.deliveryRate && s.deliveryRate.n > 0 ? `${pct(s.deliveryRate.successes / s.deliveryRate.n)} : ${count(s.deliveryRate.successes)} sur ${count(s.deliveryRate.n)} colis arrivés au bout` : null;
  }
}

const SHOP_COUNT: Record<Exclude<Stage, "cpm">, keyof ShopMeasures> = { ctr: "ctr", landing: "landing", orderRate: "orderRate", confirmRate: "confirmRate", deliveryRate: "deliveryRate" };

export function buildForecast(env: ForecastEnv, plan: PlanInput): ForecastResult | { error: string } {
  const offer = env.offers.find((o) => o.key === plan.offerKey) ?? env.offers[0];
  if (!offer) return { error: "Ce produit n'a pas de prix." };
  const picked = pickRanges(env.benchmarks);
  const calib = calibrationFactors(env.calibration);
  const range = (stage: Stage) => {
    const metric = (Object.keys(BENCH_STAGE) as (keyof typeof BENCH_STAGE)[]).find((m) => BENCH_STAGE[m] === stage);
    return metric ? (picked[metric] ?? null) : null;
  };
  const inputs: ForecastInputs = {
    cpm: { prior: range("cpm")?.range ?? null, shop: env.shop.cpm },
    rates: Object.fromEntries(RATE_STAGES.map((s) => [s, { prior: range(s)?.range ?? null, shop: (env.shop[SHOP_COUNT[s]] as Count | null) ?? null }])) as ForecastInputs["rates"],
    calibration: calib,
  };
  const dists = stageDists(inputs);

  const creatives: CreativeFactor[] = plan.creatives.map((c) => ({ id: c.id, ctrFactor: c.review?.ctrFactor ?? 1, convFactor: c.review?.convFactor ?? 1, confidence: c.review?.confidence ?? "low" }));
  const known = new Set(plan.creatives.map((c) => c.id));
  const adSets = plan.adSets.map((a) => ({ ...a, creativeIds: a.creativeIds.filter((x) => known.has(x)) }));
  const model: Plan = { adSets: adSets.map((a) => ({ id: a.id, creativeIds: a.creativeIds, dailyBudget: a.dailyBudget })), days: plan.days, creatives };
  const econ: Economics = {
    revenue: offer.revenue,
    productCost: offer.productCost,
    carrierPerParcel: env.carrierPerParcel,
    returnPerParcel: env.returnPerParcel,
    shipped: env.shop.shipped,
    maxCostPerDelivered: offer.maxCostPerDelivered,
  };
  const sim = simulate(model, dists, econ, { optimized: env.optimized });

  const stages: StageRow[] = (["cpm", "ctr", "landing", "orderRate", "confirmRate", "deliveryRate"] as Stage[]).map((stage) => {
    const d = dists[stage];
    const r = range(stage);
    return {
      stage,
      label: STAGE_LABELS[stage],
      value: d ? { median: d.median, low: d.low, high: d.high } : null,
      basis: d?.basis ?? null,
      shop: shopText(stage, env.shop),
      public: r ? { ...r.range, market: r.market, marketLabel: MARKET_LABELS[r.market], sources: r.sources.map((b) => ({ title: b.title || b.url, url: b.url, checked: b.checked })) } : null,
      calibration: r && calib[stage] != null && Math.abs(calib[stage]! - 1) > 0.005 ? calib[stage]! : null,
    };
  });

  const launchable = plan.creatives.filter((c) => c.review?.verdict !== "skip");
  const ready = plan.creatives.filter((c) => c.review?.verdict === "launch");
  const testCount = (ready.length || launchable.length) || plan.creatives.length;
  const test = offer.maxCostPerDelivered != null && offer.maxCostPerDelivered > 0 ? testPlan({ maxCostPerDelivered: offer.maxCostPerDelivered, creatives: Math.max(1, testCount), days: plan.days, maxLoss: plan.maxLoss }) : null;
  const daily = adSets.reduce((s, a) => s + a.dailyBudget, 0);
  const base = test?.daily ?? daily;
  const options = base > 0 ? budgetOptions(model, dists, econ, [...OPTIONS.map((k) => base * k), daily], { optimized: env.optimized, verdictSpend: test?.total ?? null }) : [];

  const learnBench = picked.learningEvents;
  const needed = learnBench ? learnBench.range.low : null;
  const learning: Learning = {
    needed,
    source: learnBench ? { title: learnBench.sources[0].title || learnBench.sources[0].url, url: learnBench.sources[0].url, checked: learnBench.sources[0].checked } : null,
    adSets: sim.learningEvents.map((e) => ({ id: e.adSetId, name: adSets.find((a) => a.id === e.adSetId)?.name ?? e.adSetId, p50: e.p50 })),
    ok: needed != null && sim.learningEvents.length ? sim.learningEvents.every((e) => e.p50 >= needed) : null,
  };

  const rows: CreativeRow[] = plan.creatives.map((c, i) => ({
    ...creativeOutlook(creatives[i], dists, econ),
    label: c.label,
    verdict: c.review?.verdict ?? null,
    ctrFactor: creatives[i].ctrFactor,
    convFactor: creatives[i].convFactor,
    reviewed: c.review != null,
  }));

  const opd = sim.metrics.ordersPerDinar;
  const saved: SavedForecast = { rates: sim.rates, ordersPerDinar: opd ? { p10: opd.p10, p90: opd.p90 } : null };
  return { offer, stages, sim, creatives: rows, test, options, learning, advice: advise(env, plan, offer, sim, rows, test, learning, daily), saved, daily, total: daily * plan.days };
}

// ── The advice ─────────────────────────────────────────────────────────

const LABEL_OF: Partial<Record<Stage, string>> = { cpm: BENCH_LABELS.cpm, ctr: BENCH_LABELS.ctr, landing: BENCH_LABELS.landing, orderRate: BENCH_LABELS.orderRate, confirmRate: BENCH_LABELS.confirmRate, deliveryRate: BENCH_LABELS.deliveryRate };

function advise(env: ForecastEnv, plan: PlanInput, offer: OfferEcon, sim: Simulation, rows: CreativeRow[], test: TestPlan | null, learning: Learning, daily: number): ForecastResult["advice"] {
  const out: ForecastResult["advice"] = [];
  if (sim.missing.length) {
    const early = sim.missing.some((s) => s === "cpm" || s === "ctr" || s === "landing" || s === "orderRate");
    out.push({ tone: "bad", text: `Pas de chiffre pour : ${sim.missing.map((s) => LABEL_OF[s] ?? s).join(", ")}. Cherchez les chiffres publics, ou cochez-en un, pour prévoir ${early ? "les commandes" : "les colis livrés et le bénéfice"}.` });
  }
  if (offer.productCost == null) out.push({ tone: "bad", text: "Le coût fournisseur de ce produit manque : sans lui, ni plafond ni bénéfice. Renseignez-le sur la fiche du produit." });
  else if (env.carrierPerParcel == null || env.returnPerParcel == null) out.push({ tone: "bad", text: "Le coût du transporteur ou du retour manque dans Paramètres : sans lui, pas de bénéfice." });

  const unread = rows.filter((r) => !r.reviewed);
  if (unread.length) out.push({ tone: "warn", text: `${unread.map((r) => r.label).join(", ")} : pas encore lue${unread.length > 1 ? "s" : ""} par Claude. La prévision ${unread.length > 1 ? "les" : "la"} compte comme une publicité ordinaire, avec une grande incertitude.` });
  const skip = rows.filter((r) => r.verdict === "skip");
  if (skip.length) out.push({ tone: "bad", text: `À ne pas lancer : ${skip.map((r) => r.label).join(", ")} (voir la lecture de Claude). Elle${skip.length > 1 ? "s sont comptées" : " est comptée"} dans la prévision tant qu'elle${skip.length > 1 ? "s restent" : " reste"} dans un ensemble.` });
  const fix = rows.filter((r) => r.verdict === "fix");
  if (fix.length) out.push({ tone: "warn", text: `À corriger avant de dépenser : ${fix.map((r) => r.label).join(", ")}.` });
  const ranked = rows.filter((r) => r.verdict !== "skip" && r.costPerDelivered != null).sort((a, b) => a.costPerDelivered! - b.costPerDelivered!);
  if (ranked.length >= 2) out.push({ tone: "info", text: `D'après la lecture des publicités, ${ranked[0].label} devrait coûter le moins par commande livrée (environ ${money(ranked[0].costPerDelivered)}), ${ranked[ranked.length - 1].label} le plus (environ ${money(ranked[ranked.length - 1].costPerDelivered)}). Une estimation à vérifier par le test, pas une promesse.` });

  if (test) {
    out.push({
      tone: "info",
      text: `Budget de test conseillé : ${money(test.total)} pour ${test.creatives} publicité${test.creatives > 1 ? "s" : ""}, soit environ ${money(test.daily)} par jour pendant ${test.days} jours. ${test.creatives > 1 ? "Chacune" : "Elle"} doit dépenser ${money(test.perCreative)} (deux fois ce qu'une commande livrée peut coûter, ${money(offer.maxCostPerDelivered)}) ou faire 10 commandes avant d'être jugée : c'est la règle de l'onglet Créatives.${test.dropped ? ` Votre perte maximum ne permet d'en tester que ${test.creatives} : commencez par la mieux notée.` : ""}`,
    });
    if (daily > 0 && daily < test.daily * 0.7) out.push({ tone: "warn", text: `Votre plan dépense ${money(daily)} par jour : il faudra environ ${Math.ceil(test.total / daily)} jours pour juger chaque publicité. Moins de publicités à la fois, ou plus de budget.` });
    if (daily > test.daily * 1.5) out.push({ tone: "warn", text: `Votre plan dépense ${money(daily)} par jour, plus que le test n'en demande : sans preuve sur ce produit, ce surplus est un pari. Augmentez par paliers de 20 à 30 % une fois qu'une publicité est rentable.` });
  }

  if (sim.probProfit != null) {
    const p = sim.probProfit;
    const cpd = sim.metrics.costPerDelivered;
    const line = `Sur ${plan.days} jours à ${money(daily)} par jour : ${Math.round(p * 100)} % de chances de gagner de l'argent${cpd && Number.isFinite(cpd.p50) ? `, une commande livrée à environ ${money(cpd.p50)} (plafond ${money(offer.maxCostPerDelivered)})` : ""}.`;
    out.push({ tone: p >= 0.6 ? "good" : p >= 0.35 ? "warn" : "bad", text: line });
    if (p < 0.35) out.push({ tone: "bad", text: "À ces chiffres, le test perd probablement de l'argent : une meilleure accroche, une offre en lot, un prix plus haut ou un coût fournisseur plus bas changent le calcul (onglet Seuils)." });
  }

  if (learning.needed != null && learning.adSets.length) {
    const low = learning.adSets.filter((a) => a.p50 < learning.needed!);
    if (low.length) {
      out.push({
        tone: "warn",
        text: `Meta demande environ ${count(learning.needed)} événements par semaine et par ensemble pour sortir de l'apprentissage (source : ${learning.source?.title}). Ici, ${low.map((a) => `${a.name} en ferait environ ${count(a.p50)}`).join(", ")}. ${plan.adSets.length > 1 ? "Regroupez les publicités dans moins d'ensembles. " : ""}${env.optimized !== "placed" ? "Envoyer l'achat à la commande (Paramètres) donne plus d'événements. " : ""}Jugez sur le coût par commande livrée, pas sur le statut « Apprentissage ».`,
      });
    } else out.push({ tone: "good", text: `Chaque ensemble devrait dépasser les ${count(learning.needed)} événements par semaine que Meta demande pour sortir de l'apprentissage.` });
  }
  return out;
}
