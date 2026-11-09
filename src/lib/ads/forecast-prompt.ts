import { z } from "zod";
import type { BriefInput } from "./brief";
import { ideasFacts } from "./ideas-prompt";
import { FACTOR_MAX, FACTOR_MIN, type Confidence, type Range, type Stage } from "./forecast-model";

/**
 * The two requests behind the ads forecast, shared by the server (with an
 * API key, forecast-ai.ts) and the manual way (the owner copies the text
 * into claude.ai, attaches the pictures, and pastes the reply back):
 *
 *  1. Public figures. Claude searches the web for published numbers on Meta
 *     ads for a cash-on-delivery shop in Tunisia (CPM, link CTR, landing,
 *     orders per visit, confirmation, delivery, the learning phase), each
 *     with its page, its market, its year and the sentence it comes from.
 *     A figure without a page is never used. With the API, a page counts as
 *     "checked" only when it came back from Claude's own search or fetch;
 *     a pasted reply is "to check": the owner opens the link and ticks it.
 *
 *  2. The creatives. Claude looks at the real ads (pictures, and still frames
 *     of each video, taken in the browser), their texts, the product's
 *     photos and facts, and grades each on what moves clicks and orders, as
 *     two factors on the click rate and the order rate (×0.5 to ×1.6) with
 *     reasons, what to fix, and whether to launch it at all.
 *
 *   BENCH_SYSTEM, benchTask(), benchRequest()     the request for the public figures
 *   BENCH_SCHEMA / readBenchReply(reply)          its answer, as the API's tool input or a pasted reply
 *   toBenchmarks(answer, seenUrls?, now)          → Benchmark[]   converted (%, TND) and marked checked or not
 *   pickRanges(benchmarks)                        → Picked        one range per stage: the most local market, every source of it
 *   REVIEW_SYSTEM, reviewTask(), reviewRequest()  the request for the creatives
 *   REVIEW_SCHEMA / readReviewReply(reply, ids)   its answer, checked against the creatives sent
 */

// ── 1. Public figures ──────────────────────────────────────────────────

export const BENCH_METRICS = ["cpm", "ctr", "cpc", "landing", "orderRate", "confirmRate", "deliveryRate", "learningEvents"] as const;
export type BenchMetric = (typeof BENCH_METRICS)[number];
export const MARKETS = ["tunisia", "maghreb", "mena", "global"] as const;
export type Market = (typeof MARKETS)[number];

export const BENCH_LABELS: Record<BenchMetric, string> = {
  cpm: "CPM (coût pour 1 000 affichages)",
  ctr: "CTR lien",
  cpc: "Coût par clic sur le lien",
  landing: "Arrivées sur la page par clic",
  orderRate: "Commandes par visite",
  confirmRate: "Commandes confirmées au téléphone",
  deliveryRate: "Colis livrés et payés",
  learningEvents: "Phase d'apprentissage Meta (événements par semaine)",
};
export const MARKET_LABELS: Record<Market, string> = { tunisia: "Tunisie", maghreb: "Maghreb", mena: "Moyen-Orient et Afrique du Nord", global: "Monde" };

const shortText = z.string().trim().max(600);
/** A page address shown as a link: http or https only (a pasted reply could carry "javascript:"). */
const webUrl = z.string().trim().max(600).refine((u) => /^https?:\/\/[^\s]+$/i.test(u) && URL.canParse(u), "not a web address");
const RawFigure = z.object({
  metric: z.enum(BENCH_METRICS),
  low: z.number().finite().nonnegative(),
  high: z.number().finite().nonnegative(),
  unit: z.enum(["percent", "TND", "USD", "EUR", "events"]),
  market: z.enum(MARKETS).catch("global"),
  period: z.string().trim().max(40),
  url: webUrl,
  title: shortText,
  quote: shortText,
  note: shortText.default(""),
});
const RawFx = z.object({ currency: z.enum(["USD", "EUR"]), tndPerUnit: z.number().finite().positive(), url: webUrl, quote: shortText, date: z.string().trim().max(40) });
export const BenchAnswer = z.object({ figures: z.array(RawFigure).max(60), fx: z.array(RawFx).max(4).default([]) });
export type BenchAnswer = z.output<typeof BenchAnswer>;

const s = { type: "string" } as const;
const n = { type: "number" } as const;
export const BENCH_SCHEMA = {
  type: "object",
  properties: {
    figures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          metric: { type: "string", enum: [...BENCH_METRICS] },
          low: n,
          high: n,
          unit: { type: "string", enum: ["percent", "TND", "USD", "EUR", "events"] },
          market: { type: "string", enum: [...MARKETS] },
          period: s,
          url: s,
          title: s,
          quote: s,
          note: s,
        },
        required: ["metric", "low", "high", "unit", "market", "period", "url", "title", "quote", "note"],
        additionalProperties: false,
      },
    },
    fx: {
      type: "array",
      items: {
        type: "object",
        properties: { currency: { type: "string", enum: ["USD", "EUR"] }, tndPerUnit: n, url: s, quote: s, date: s },
        required: ["currency", "tndPerUnit", "url", "quote", "date"],
        additionalProperties: false,
      },
    },
  },
  required: ["figures", "fx"],
  additionalProperties: false,
};

export const BENCH_SYSTEM = `You research published figures for a small online shop in Tunisia that sells with cash on delivery and advertises on Facebook and Instagram (Meta ads), mostly to people on phones. The shop owner will use these figures to forecast a first ad test, before having enough results of their own. A wrong figure costs them real money, so only a figure written on a page you actually read counts.

Find, for each of these measures, figures published on the web:
- "cpm": cost per 1 000 impressions of Meta ads.
- "ctr": link click-through rate of Meta ads (link clicks ÷ impressions). Not "all clicks".
- "cpc": cost per link click of Meta ads.
- "landing": share of link clicks that become a landing page view or a visit.
- "orderRate": share of visits of an e-commerce product page that place an order (conversion rate).
- "confirmRate": share of cash-on-delivery orders confirmed (by phone) before shipping.
- "deliveryRate": share of shipped cash-on-delivery parcels delivered and paid (not refused or returned).
- "learningEvents": how many optimisation events an ad set needs in 7 days to leave Meta's learning phase (Meta's own help pages).

Where to look, in this order: Tunisia; then the Maghreb or North Africa (Morocco, Algeria, Tunisia); then the Middle East and North Africa; then worldwide e-commerce. Prefer the most recent years (2024 to 2026), and say the period each figure covers. Good sources: Meta's own help pages, ad-cost studies that list countries, e-commerce and cash-on-delivery logistics studies, carriers and fulfilment companies of the region, reports of Tunisian or Maghreb e-commerce bodies. Blogs that repeat a number without a source are weak: use them only when nothing better exists, and say so in "note".

Rules:
- Copy each figure as the page gives it. A range stays a range ("low" and "high"); a single figure has "low" = "high". Never compute, average or guess a figure yourself.
- "quote": the exact sentence or table line of the page that holds the figure, word for word.
- "unit": "percent" for rates (2.5 for 2.5 %), "events" for the learning phase, otherwise the currency the page uses (TND, USD or EUR). Do not convert money yourself.
- When a money figure is in USD or EUR, add to "fx" the exchange rate to Tunisian dinars from a page you read (Central Bank of Tunisia or a recent rate page), with its date and the sentence it comes from.
- "market": the market the figure is about, not where the page is published.
- Never write a page address you did not open or get from a search result. When you found nothing sure for a measure, leave it out: an empty list is a good answer.`;

export const benchTask = () => `Search the web, read the best pages, then give your answer once, with the tool "report". Every figure needs its page address, the market, the period and the exact sentence it comes from.`;

/** The same request for claude.ai, with the reply's form. */
export function benchRequest(): string {
  return `${BENCH_SYSTEM}

Search the web and read the pages before answering. Reply with only this JSON object, nothing around it:
{"figures": [{"metric": "ctr", "low": 0.9, "high": 1.6, "unit": "percent", "market": "mena", "period": "2025", "url": "https://...", "title": "...", "quote": "...", "note": ""}], "fx": [{"currency": "USD", "tndPerUnit": 3.1, "url": "https://...", "quote": "...", "date": "2026-11-01"}]}`;
}

/** The JSON object in a pasted reply (code fences and words around it ignored), or null. */
function jsonObject(reply: string): unknown {
  if (reply.length > 400_000) return null;
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  if (from < 0 || to <= from) return null;
  try {
    return JSON.parse(reply.slice(from, to + 1));
  } catch {
    return null;
  }
}

/** A pasted reply of the public figures, or null when unreadable. Figures that do not read are left out, the rest kept. */
export function readBenchReply(reply: string): BenchAnswer | null {
  const data = jsonObject(reply) as { figures?: unknown; fx?: unknown } | null;
  if (!data || !Array.isArray(data.figures)) return null;
  const figures = data.figures.map((f) => RawFigure.safeParse(f)).flatMap((r) => (r.success ? [r.data] : []));
  const fx = Array.isArray(data.fx) ? data.fx.map((f) => RawFx.safeParse(f)).flatMap((r) => (r.success ? [r.data] : [])) : [];
  return { figures, fx };
}

/** A figure as the shop keeps it: rates as fractions, money in millimes, with its page. */
export type Benchmark = {
  id: string;
  metric: BenchMetric;
  /** Fractions for rates, millimes for money, a count for the learning phase. */
  low: number;
  high: number;
  market: Market;
  period: string;
  url: string;
  title: string;
  quote: string;
  note: string;
  /** The original figure when it was converted ("2 à 4 USD, à 3,10 TND le dollar"). */
  converted: string | null;
  /** The page came back from Claude's own search or reading (API only). */
  checked: boolean;
  /** Used in the forecast: checked ones start ticked, the owner decides for the others. */
  used: boolean;
};

const MONEY: BenchMetric[] = ["cpm", "cpc"];
const RATES: BenchMetric[] = ["ctr", "landing", "orderRate", "confirmRate", "deliveryRate"];

/** An address as compared: no fragment, no trailing slash, no "www.", lower-case host. */
export function normUrl(u: string): string {
  try {
    const x = new URL(u);
    return `${x.protocol}//${x.host.toLowerCase().replace(/^www\./, "")}${x.pathname.replace(/\/+$/, "")}${x.search}`;
  } catch {
    return u.trim();
  }
}

/**
 * The answer's figures, converted and checked. A rate must read as a share
 * (0–100 %); money needs a TND rate with its own page when it is not in TND;
 * a page Claude's tools never returned is "to check" (seen: null means a
 * pasted reply, where nothing can be checked here).
 */
export function toBenchmarks(a: BenchAnswer, seen: Set<string> | null): Benchmark[] {
  const seenNorm = seen ? new Set([...seen].map(normUrl)) : null;
  const isSeen = (u: string) => seenNorm != null && seenNorm.has(normUrl(u));
  const fx = new Map(a.fx.filter((f) => !seenNorm || isSeen(f.url)).map((f) => [f.currency, f]));
  const out: Benchmark[] = [];
  a.figures.forEach((f, i) => {
    let low = Math.min(f.low, f.high);
    let high = Math.max(f.low, f.high);
    let converted: string | null = null;
    if (RATES.includes(f.metric)) {
      if (f.unit !== "percent" || high > 100 || low <= 0) return;
      low /= 100;
      high /= 100;
    } else if (MONEY.includes(f.metric)) {
      if (f.unit === "percent" || f.unit === "events" || low <= 0) return;
      if (f.unit !== "TND") {
        const rate = fx.get(f.unit);
        if (!rate) return;
        converted = `${fmtNum(f.low)} à ${fmtNum(f.high)} ${f.unit}, à ${fmtNum(rate.tndPerUnit)} TND (${rate.date}, ${rate.url})`;
        low *= rate.tndPerUnit;
        high *= rate.tndPerUnit;
      }
      low = Math.round(low * 1000);
      high = Math.round(high * 1000);
    } else if (f.unit !== "events" || low <= 0) return;
    const checked = isSeen(f.url);
    out.push({ id: `b${i + 1}`, metric: f.metric, low, high, market: f.market, period: f.period, url: f.url, title: f.title, quote: f.quote, note: f.note, converted, checked, used: checked });
  });
  return out;
}

const fmtNum = (x: number) => x.toLocaleString("fr-FR", { maximumFractionDigits: 3 });

export type Picked = Partial<Record<BenchMetric, { range: Range; market: Market; sources: Benchmark[] }>>;

/** One range per measure, from the figures ticked: the most local market that has one, and every source of that market (lowest low to highest high). */
export function pickRanges(list: Benchmark[]): Picked {
  const out: Picked = {};
  for (const metric of BENCH_METRICS) {
    const used = list.filter((b) => b.used && b.metric === metric && b.low > 0 && b.high > 0);
    const market = MARKETS.find((m) => used.some((b) => b.market === m));
    if (!market) continue;
    const sources = used.filter((b) => b.market === market);
    out[metric] = { range: { low: Math.min(...sources.map((b) => b.low)), high: Math.max(...sources.map((b) => b.high)) }, market, sources };
  }
  return out;
}

/** The forecast's stages that public figures can feed. */
export const BENCH_STAGE: Partial<Record<BenchMetric, Stage>> = { cpm: "cpm", ctr: "ctr", landing: "landing", orderRate: "orderRate", confirmRate: "confirmRate", deliveryRate: "deliveryRate" };

// ── 2. The creatives ───────────────────────────────────────────────────

/** One ad as the request shows it: its id, what it is, its texts; the pictures go with it (one sheet per ad). */
export type CreativeBrief = { id: string; kind: "video" | "image"; seconds: number | null; ratio: string; primaryText: string; headline: string; adSet: string };

const SCORE_KEYS = ["hook", "clarity", "proof", "offer", "match", "format"] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];
export const SCORE_LABELS: Record<ScoreKey, string> = {
  hook: "Accroche (1re seconde)",
  clarity: "Produit compris",
  proof: "Preuve, démonstration",
  offer: "Offre et confiance",
  match: "Pub ↔ page produit",
  format: "Format téléphone",
};
export const VERDICTS = ["launch", "fix", "skip"] as const;
export type CreativeVerdict = (typeof VERDICTS)[number];
export const VERDICT_LABELS: Record<CreativeVerdict, string> = { launch: "À lancer", fix: "À corriger d'abord", skip: "À ne pas lancer" };

const Score = z.object({ score: z.number().finite().transform((v) => Math.min(5, Math.max(1, Math.round(v)))), why: shortText });
const RawReview = z.object({
  id: z.string().trim().max(20),
  verdict: z.enum(VERDICTS).catch("fix"),
  angle: shortText,
  scores: z.object(Object.fromEntries(SCORE_KEYS.map((k) => [k, Score])) as Record<ScoreKey, typeof Score>),
  ctrFactor: z.number().finite(),
  convFactor: z.number().finite(),
  confidence: z.enum(["high", "medium", "low"]).catch("low"),
  risks: z.array(shortText).max(6).default([]),
  fixes: z.array(shortText).max(6).default([]),
  placements: z.array(z.enum(["reels", "stories", "feed"])).max(3).default([]),
});
export const ReviewAnswer = z.object({
  creatives: z.array(RawReview).min(1).max(12),
  grouping: z.array(z.array(z.string().trim().max(20)).max(12)).max(12).default([]),
  groupingWhy: shortText.default(""),
  summary: z.string().trim().max(2000).default(""),
});
export type CreativeReview = z.output<typeof RawReview> & { confidence: Confidence };
export type ReviewResult = { creatives: CreativeReview[]; grouping: string[][]; groupingWhy: string; summary: string };

const SCORE_SCHEMA = { type: "object", properties: { score: { type: "integer", enum: [1, 2, 3, 4, 5] }, why: s }, required: ["score", "why"], additionalProperties: false };
export const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    creatives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: s,
          verdict: { type: "string", enum: [...VERDICTS] },
          angle: s,
          scores: { type: "object", properties: Object.fromEntries(SCORE_KEYS.map((k) => [k, SCORE_SCHEMA])), required: [...SCORE_KEYS], additionalProperties: false },
          ctrFactor: n,
          convFactor: n,
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          risks: { type: "array", items: s },
          fixes: { type: "array", items: s },
          placements: { type: "array", items: { type: "string", enum: ["reels", "stories", "feed"] } },
        },
        required: ["id", "verdict", "angle", "scores", "ctrFactor", "convFactor", "confidence", "risks", "fixes", "placements"],
        additionalProperties: false,
      },
    },
    grouping: { type: "array", items: { type: "array", items: s } },
    groupingWhy: s,
    summary: s,
  },
  required: ["creatives", "grouping", "groupingWhy", "summary"],
  additionalProperties: false,
};

export const REVIEW_SYSTEM = `You are a media buyer who has spent large budgets on Meta ads (Facebook and Instagram: Reels, Stories, Feed) for cash-on-delivery shops in Tunisia and the Maghreb. You judge real ads before money is spent on them, and your grades move a forecast, so grade what you see, not what the ad could be.

The shop: Mena, a Tunisian online shop. Customers pay at the door, after the shop calls them to confirm. Almost everyone sees the ad on a phone, scrolling, often with the sound off; many are older people. Arabic on screen should be Tunisian derja.

What you get: the product's facts and real numbers, the product's own photos (to check the ad shows the same product), and each ad: still frames of a video in a grid (each frame labelled with its ad id and its second), or the picture itself, with its primary text and headline.

For each ad:
- "verdict": "launch", "fix" (worth launching once fixed: say what), or "skip" (wrong or different product, a claim Meta or the shop cannot back, a broken or unreadable ad).
- "angle": in a few words, what the ad sells (problem, result, demo, offer, gift…).
- "scores", 1 to 5 each, with one short reason based on what you see:
  - "hook": does the first second stop a thumb (movement, a face, the problem or the result at once)? For a picture, the first glance.
  - "clarity": is it clear at once what the product is and does, and is it the same product as the photos?
  - "proof": is the product shown working, in real use, by a person?
  - "offer": is the price or offer clear and the same as the shop's, and is there a reason to trust (cash on delivery, open before paying)?
  - "match": will the visitor find on the product page what the ad promised (same product, same promise, same price)?
  - "format": vertical or square, text big enough on a phone, readable without sound, nothing important at the edges.
- "ctrFactor": the ad's link click rate against an ordinary ad of a Tunisian cash-on-delivery shop for this kind of product (1.0). Anchors: 0.6 when the product or the point is unclear in the first two seconds, or it looks like a copied supplier video with foreign text; 1.0 ordinary; 1.3 a hook in the first second that shows the problem or the result, the product used by a person, derja text; 1.5 to ${FACTOR_MAX} rare, all of that and a striking demonstration. From ${FACTOR_MIN} to ${FACTOR_MAX}.
- "convFactor": the share of visitors who order, against an ordinary ad (1.0): higher when the ad sets the right expectation (same product, price and offer as the page, a result the page shows too) and builds trust; lower when it promises more than the page shows, hides the price, or brings curious clicks (0.6 to 0.8). From ${FACTOR_MIN} to ${FACTOR_MAX}.
- "confidence": "high" when the frames show the ad well, "medium" usually, "low" when the frames or texts leave much unknown.
- "risks": what could get the ad rejected or the account flagged by Meta (health or body claims, before/after of a body, personal attributes, fake urgency or scarcity, a price not on the site), or refused parcels (a promise the product does not keep).
- "fixes": up to four concrete changes, the most useful first ("put the result in the first second", "add derja captions", "show the price 59,900 DT as on the page").
- "placements": where it fits: "reels", "stories", "feed".

Then "grouping": which ads to put together in one ad set (the same angle and audience together), as lists of ids, and "groupingWhy" in one or two sentences. "summary": three to five sentences for the owner, in plain French: what is strong, what to fix before spending, and which ad to bet on.

Write every reason, fix, risk and summary in plain French. Never invent a fact about the product, a review, a number of buyers or a result: the shop has no published reviews unless the facts say so.`;

/** The facts and the ads, as the user message. Pictures go next to it (the API) or are attached by the owner (claude.ai), in the order listed. */
export function reviewTask(input: BriefInput, creatives: CreativeBrief[], photoCount: number): string {
  const facts = ideasFacts(input);
  return `The product's facts and real numbers (JSON):
${JSON.stringify({ product: facts.product, shop: facts.shop, reviews: { published: facts.reviews.published, average: facts.reviews.average }, results: facts.results, ceilings: facts.ceilings }, null, 1)}

Pictures, in this order:
${[
  ...Array.from({ length: photoCount }, (_, i) => `- Picture ${i + 1}: the product's own photo ${i + 1} (reference, not an ad).`),
  ...creatives.map((c, i) => `- Picture ${photoCount + i + 1}: ad ${c.id}, ${c.kind === "video" ? `video${c.seconds != null ? ` of ${Math.round(c.seconds)} s` : ""}, still frames labelled with their second` : "picture"}, ${c.ratio}.`),
].join("\n")}

The ads' texts (JSON):
${JSON.stringify(
  creatives.map((c) => ({ id: c.id, kind: c.kind, seconds: c.seconds, ratio: c.ratio, adSet: c.adSet, primaryText: c.primaryText, headline: c.headline })),
  null,
  1,
)}

Grade every ad listed, with its exact id.`;
}

/** The same request for claude.ai: the owner attaches the pictures in the order listed, then pastes this. */
export function reviewRequest(input: BriefInput, creatives: CreativeBrief[], photoCount: number): string {
  return `${REVIEW_SYSTEM}

${reviewTask(input, creatives, photoCount)}

Reply with only this JSON object, nothing around it:
{"creatives": [{"id": "C1", "verdict": "launch", "angle": "...", "scores": {"hook": {"score": 4, "why": "..."}, "clarity": {"score": 4, "why": "..."}, "proof": {"score": 3, "why": "..."}, "offer": {"score": 3, "why": "..."}, "match": {"score": 4, "why": "..."}, "format": {"score": 5, "why": "..."}}, "ctrFactor": 1.2, "convFactor": 1.0, "confidence": "medium", "risks": [], "fixes": ["..."], "placements": ["reels"]}], "grouping": [["C1", "C2"]], "groupingWhy": "...", "summary": "..."}`;
}

/**
 * An answer about the creatives, checked against the ads sent: only their
 * ids, each once, every factor held to its range, the grouping limited to
 * known ids. Null when not one ad of the list is graded.
 */
export function cleanReview(data: unknown, ids: string[]): ReviewResult | null {
  if (!data || typeof data !== "object" || !Array.isArray((data as { creatives?: unknown }).creatives)) return null;
  const d = data as { creatives: unknown[]; grouping?: unknown; groupingWhy?: unknown; summary?: unknown };
  const known = new Set(ids);
  const seen = new Set<string>();
  const creatives: CreativeReview[] = [];
  for (const raw of d.creatives.slice(0, 24)) {
    const c = RawReview.safeParse(raw);
    if (!c.success || !known.has(c.data.id) || seen.has(c.data.id)) continue;
    seen.add(c.data.id);
    creatives.push({ ...c.data, ctrFactor: clampFactor(c.data.ctrFactor), convFactor: clampFactor(c.data.convFactor) });
  }
  if (!creatives.length) return null;
  const rest = ReviewAnswer.omit({ creatives: true }).safeParse({ grouping: d.grouping ?? [], groupingWhy: d.groupingWhy ?? "", summary: d.summary ?? "" });
  const other = rest.success ? rest.data : { grouping: [], groupingWhy: "", summary: "" };
  const grouping = other.grouping.map((g) => [...new Set(g.filter((id) => seen.has(id)))]).filter((g) => g.length);
  return { creatives, grouping, groupingWhy: other.groupingWhy, summary: other.summary };
}

const clampFactor = (x: number) => Math.round(Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, x)) * 100) / 100;

/** A pasted reply about the creatives, or null when unreadable. */
export function readReviewReply(reply: string, ids: string[]): ReviewResult | null {
  return cleanReview(jsonObject(reply), ids);
}
