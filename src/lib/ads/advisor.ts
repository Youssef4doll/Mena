import { formatTND } from "../money";
import { fmt } from "../viz";
import { INPUT_LABELS, kpis, pendingOf, plural, pluralWord, reportedOrders, totalRow, type KpiOptions, type Kpis } from "./kpis";
import { costInterval, probBeats, probBestCost, probBestRate, probCostUnder, probRateAbove, wilson, type Count, type Interval } from "./stats";
import { STALE_PENDING_HOURS, type AdRow, type Advice, type Baseline, type CallDelayRow, type Costs, type DayPoint, type Fix, type Insight, type Severity } from "./types";

/**
 * The media buyer. Reads every row the way someone who has run very large
 * cash-on-delivery budgets on Meta and TikTok would, and says what to do,
 * in plain French, with the numbers behind it. Pure and deterministic.
 *
 * The rules it holds to:
 *  - The only true KPI is the cost per DELIVERED order against what a
 *    delivered order leaves. Placed orders lie (fake orders, refusals), and
 *    the platform's own purchase count lies more.
 *  - No verdict without evidence: a row is judged once it has spent twice its
 *    max cost per delivered order, or has 10 orders. Before that: "wait".
 *  - Young rows have open orders: they are read through a projection (the
 *    row's rates pulled toward the shop's), and the text says so.
 *  - Winners are scaled by 20–30 % steps, never doubled, and only after 3
 *    days of spend, once most of their orders have been called, and while
 *    their last 7 days cost no clearly more per order than the days before;
 *    losers are cut; "fix" when one stage is clearly the problem and fixing
 *    it would be enough. Without a margin nothing is scaled or paused: rows
 *    are only ranked against the account's average.
 *  - The account is the sum of its lines: it is "scale" only when one of
 *    them is, and its headline is read off its own verdict, so the two
 *    always say the same.
 *  - Budgets are set on campaigns and ad sets: an ad is kept or switched
 *    off, never given a percentage.
 *  - One bottleneck at a time: the stage whose gap costs the most, held
 *    against like for like (an ad against the other ads of its campaign, a
 *    CPM or a CTR against the same platform).
 *
 *   advise(input)                        → Report         everything below, in one call
 *   adviseRow(row, k, ctx)               → RowAdvice      verdict, confidence, budget change, reasons
 *   reference(rest, baseline)            → Reference      what a row's stages are compared with
 *   bottleneck(row, ref)                 → Bottleneck | null
 *   fatigue(points, frequency?)          → Fatigue | null
 *   costTrend(points)                    → CostTrend | null  the last 7 days' cost per order against the days before
 *   trackingInsights(rows, total, k, setup?, coverage?, days?, baseline?) → Insight[]
 *   callDelayInsight(rows)               → Insight | null  orders called within the hour against those called late
 *   readSegments(rows)                   → SegmentRead[]  rates, intervals and flags for an audience table
 *   segmentInsights(kind, rows)          → Insight[]
 *   hourBlocks(rows, size?)              → SegmentRow[]   24 hours grouped into blocks with enough orders
 *   compareAds(rows, metric, costs, baseline) → AdComparison[]  winner probability and intervals
 *   creativeInsights(rows, costs, baseline)   → Insight[]
 *   sortInsights(insights)               → Insight[]      critical first
 */

// ── Thresholds ─────────────────────────────────────────────────────────

/** A row is judged once it spent twice its max cost per delivered order: at break-even it would show about 2 deliveries by then, so 0 is a signal, not bad luck. */
export const JUDGE_SPEND_MULTIPLE = 2;
/** …or once it has this many placed orders, whatever it spent. */
export const JUDGE_MIN_ORDERS = 10;
/** Probability of being under the max cost per delivered order above which a row is a winner… */
export const WIN_PROB = 0.9;
/** …and under which it is a loser. In between, the money is not decided yet. */
export const LOSE_PROB = 0.1;
/** Scale only with room: under 80 % of the max, because the cost per delivered order rises as the budget grows. */
export const SCALE_MAX_SHARE = 0.8;
/** Budget steps in percent. Meta and TikTok restart their learning when a budget jumps much more than 20–30 %. */
export const SCALE_STEP = 20;
export const BIG_SCALE_STEP = 30;
/** The bigger step needs a clear winner: very likely profitable and under 60 % of the max. */
export const BIG_SCALE_PROB = 0.97;
export const BIG_SCALE_MAX_SHARE = 0.6;
/** Up to 30 % over the max, a row is close enough to reduce and fix rather than cut. */
export const NEAR_MAX_SHARE = 1.3;
/** Budget cuts: lighter when close to the max, firmer while fixing a loser, a pause when cut. */
export const NEAR_STEP = -20;
export const FIX_STEP = -30;
export const CUT_STEP = -100;
/** Certainty (the larger of p and 1 − p) for a high or a medium confidence; high also needs 30 orders or 4 times the max spent. */
export const HIGH_CERTAINTY = 0.97;
export const MEDIUM_CERTAINTY = 0.85;
export const HIGH_ORDERS = 30;
export const HIGH_SPEND_MULTIPLE = 4;
/** Above this share of open orders the money figures are mostly projection: confidence at most medium, and only the small scale step. */
export const YOUNG_OPEN_SHARE = 0.5;
/** Frequency above which the audience has seen the ad too often to take more budget. */
export const SATURATED_FREQUENCY = 3.5;
/** Days with spend a winner needs before more budget: an ad's first days swing a lot, whatever the totals say. */
export const MIN_SCALE_DAYS = 3;
/** Above this share of orders still waiting for their call, a winner waits for the calls: the phone tells real orders from fake ones. */
export const PENDING_SCALE_SHARE = 0.5;
/** Last days with a known spend the current daily budget is read from (a campaign started late in the period spends more per day than its average). */
export const BUDGET_DAYS = 3;
/** Spend with no visit at all above 10 DT: the link or its UTM is wrong, it is not bad luck. */
export const TRACKING_MIN_SPEND = 10_000;
/** 100+ platform clicks and under 20 % arriving as visits: the UTM does not match; a slow page loses less than that. */
export const TRACKING_MIN_CLICKS = 100;
export const TRACKING_LANDING_FLOOR = 0.2;
/** Under this share of placed orders ending delivered, the platform's CPA hides much of the true cost. */
export const PLACED_LIE_RATE = 0.7;
/**
 * Under this share of placed orders ending delivered, a winner is not scaled
 * however cheap its deliveries: each sale costs several calls, parcels and
 * returns the margin does not count (call time, damaged goods), and more
 * budget brings more of the same buyers.
 */
export const FRAGILE_NET_RATE = 0.35;
/** Platform purchases per real order above which the platform over-reports, under which the pixel misses sales; and the counts needed to say so. */
export const OVER_REPORT_RATIO = 1.5;
export const UNDER_REPORT_RATIO = 0.5;
export const REPORT_MIN_EVENTS = 10;
/** Under this confirmation rate, a pixel told at "placed" learns from too many people who never buy. */
export const PIXEL_CONFIRM_FLOOR = 0.8;
/** Optimisation events per week an ad set needs to leave the learning phase on Meta. */
export const LEARNING_EVENTS_PER_WEEK = 50;
/**
 * Meta and TikTok credit an ad with a purchase made up to 7 days after the
 * click. From 5 days between order and delivery on average, many purchases
 * sent at delivery arrive after that window and teach the algorithm nothing.
 */
export const LATE_DELIVERY_DAYS = 5;
/** People a Meta lookalike audience needs as its source. */
export const LOOKALIKE_MIN_BUYERS = 100;
/** Share of recent orders that should carry a source when ads run. */
export const UTM_COVERAGE_FLOOR = 0.7;
/** One row making this share of the delivered orders: the account hangs on it. Needs this many delivered orders in all. */
export const CONCENTRATION_SHARE = 0.6;
export const CONCENTRATION_MIN_DELIVERED = 10;
/** This many rows still waiting for data, together taking this share of the spend: the budget is spread too thin. */
export const FRAGMENTED_ROWS = 4;
export const FRAGMENTED_SHARE = 0.4;
/** Orders, and the margin's base, under which the AOV is not compared; 15 % under the shop's AOV calls for packs. */
export const AOV_MIN_ORDERS = 15;
export const AOV_LOW_SHARE = 0.85;

/** A stage is a bottleneck when its rate is, with 95 % probability, under 90 % of its reference. */
export const STAGE_SIGNIFICANCE = 0.05;
export const STAGE_TOLERANCE = 0.1;
/** CPM this many times the reference: the audience is too narrow or too contested. */
export const CPM_HIGH_FACTOR = 1.5;
/**
 * Rules of thumb for cash-on-delivery shops on Meta and TikTok, used only
 * when the shop has no reference of its own, and always called general
 * guidance in the text: 1 % link CTR, 70 % of link clicks arriving, 60 % of
 * visits opening a product, 6 % of product views starting the form, a third
 * of the forms finished, 70 % confirmed, 75 % delivered. Deliberately low floors.
 */
export const GUIDE: Record<Exclude<Stage, "cpm">, number> = { ctr: 0.01, landing: 0.7, view: 0.6, formStart: 0.06, formCompletion: 0.35, confirmation: 0.7, delivery: 0.75 };
/** Counts a row needs behind a stage before that stage can be blamed, and a reference from the rest of the account before it is used. */
const STAGE_MIN: Record<Stage, number> = { cpm: 10_000, ctr: 2_000, landing: 50, view: 50, formStart: 50, formCompletion: 20, confirmation: 15, delivery: 15 };
const REF_MIN: Record<Stage, number> = { cpm: 20_000, ctr: 5_000, landing: 200, view: 200, formStart: 200, formCompletion: 60, confirmation: 40, delivery: 40 };

/**
 * Recent trend: the last 7 days of the period against the days before them,
 * on the cost per placed order (a day's orders do not age, its deliveries
 * do: last week's orders are mostly still open). A winner whose cost per
 * order rose 30 % or more is not scaled, once each side has 10 orders and
 * the rise is 80 % likely to be real. The bar is lower than a verdict's:
 * holding a winner a few days costs little, scaling one that is turning
 * costs a lot.
 */
export const TREND_RECENT_DAYS = 7;
export const TREND_MIN_ORDERS = 10;
export const TREND_RISE = 0.3;
export const TREND_SIGNIFICANCE = 0.8;
/** Orders still waiting for their call after STALE_PENDING_HOURS from which the owner is told to call them: five unconfirmed orders are sales slipping away. */
export const STALE_MIN_ORDERS = 5;
/** Orders confirmed then cancelled before shipping, and their share of the confirmed ones, from which they are reported apart. */
export const LATE_CANCEL_MIN_ORDERS = 5;
export const LATE_CANCEL_SHARE = 0.1;
/**
 * Call delay: orders called within the hour against those called after more
 * than 4 hours, with the audience segments' test (enough orders on each side,
 * an 8-point gap, one comparison within the false-alarm budget).
 */
const CALL_FAST: CallDelayRow["bucket"][] = ["1h"];
const CALL_SLOW: CallDelayRow["bucket"][] = ["24h", "later"];

/** Fatigue: the last 3 active days against up to 7 days before them. */
export const FATIGUE_RECENT_DAYS = 3;
export const FATIGUE_BASE_DAYS = 7;
/** Impressions (or visits, without platform figures) each window needs. */
export const FATIGUE_MIN_IMPRESSIONS = { base: 3_000, recent: 1_000 };
export const FATIGUE_MIN_SESSIONS = { base: 150, recent: 60 };
/** CTR down 20 % (clear) or 15 % (early), with 95 % probability that the drop is real; CPM up 15 % or a frequency of 2.5 confirms it. */
export const FATIGUE_CTR_DROP = 0.2;
export const FATIGUE_EARLY_DROP = 0.15;
export const FATIGUE_SIGNIFICANCE = 0.95;
export const FATIGUE_CPM_RISE = 0.15;
export const FATIGUE_FREQUENCY = 2.5;
/** Without platform figures: cost per visit up 30 % reads as early fatigue (CTR down or CPM up, we cannot tell which). */
export const FATIGUE_COST_RISE = 0.3;

/** Audience segments: orders or parcels a segment needs, the smallest gap worth acting on, and the false-alarm budget shared by all the segments of a table. */
export const SEGMENT_MIN_ORDERS = 20;
export const SEGMENT_MIN_PARCELS = 15;
export const SEGMENT_MIN_GAP = 0.08;
export const SEGMENT_FALSE_ALARM = 0.1;
export const SEGMENT_MAX_INSIGHTS = 3;

/** Ads: what an ad needs before it is compared, per metric; and the winner probability that names a winner. */
const AD_MIN: Record<AdMetric, number> = { cost: 3, orderRate: 100, ctr: 1_000, confirmRate: 15, deliveryRate: 15 };
export const AD_WINNER_PROB = 0.9;

const META_SOURCES = new Set(["facebook", "fb", "instagram", "ig", "meta", "messenger", "audience_network", "an"]);
const TIKTOK_SOURCES = new Set(["tiktok", "tt", "tiktok_ads"]);

// ── Types ──────────────────────────────────────────────────────────────

export type Stage = "cpm" | "ctr" | "landing" | "view" | "formStart" | "formCompletion" | "confirmation" | "delivery";
/** "campaign": the other ads of the campaign; "platform": the rest of the same platform; "account": the rest of the account. */
export type RefKind = "campaign" | "platform" | "account" | "shop" | "guide";
/** `who`: how the text names the comparison ("les autres publicités de la campagne"). */
type RefValue = { value: number; kind: RefKind; who?: string };
/** Per stage; `viewOrder` (orders per product view) stands in for both form stages when a row's form events cannot be trusted. */
export type Reference = Partial<Record<Stage, RefValue>> & { viewOrder?: RefValue };

export type Bottleneck = {
  stage: Stage;
  rate: number;
  reference: number;
  referenceKind: RefKind;
  /** How many times cheaper a delivered order would be with this stage at its reference (CPM: how many times dearer the reach is). */
  factor: number;
  /** Count behind the rate. */
  n: number;
  title: string;
  evidence: string;
  action: string;
};

export type Trend = { base: number; recent: number; change: number };

/** Spend and placed orders over some days, and their cost per order. */
export type TrendWindow = { days: number; spend: number; orders: number; cpa: number };
/** The last TREND_RECENT_DAYS against the days before; `worse` when the rise in cost per order is large and likely real. */
export type CostTrend = { base: TrendWindow; recent: TrendWindow; change: number; probWorse: number; worse: boolean };

export type Fatigue = {
  level: "none" | "early" | "clear";
  /** "platform": read from impressions and clicks; "visits": only the shop's visits and the spend (weaker). */
  basis: "platform" | "visits";
  ctr: Trend | null;
  cpm: Trend | null;
  costPerVisit: Trend | null;
  orderRate: Trend | null;
  frequency: number | null;
  /** French, with the numbers; empty when level is "none". */
  evidence: string;
};

export type RowAdvice = Advice & {
  kpis: Kpis;
  /** The max cost per delivered order the row is judged against, and where it comes from ("account": the account's average, costs missing). */
  target: number | null;
  targetBasis: "margin" | "account" | null;
  /** Cost per delivered order the verdict used: the projection when orders are still open. */
  judgedCpd: number | null;
  /** Probability that the true cost per delivered order is under the target. */
  probProfitable: number | null;
  /** Spend still needed before the row can be judged ("wait"). */
  moreSpend: number | null;
  bottleneck: Bottleneck | null;
  fatigue: Fatigue | null;
  /** Cost per order of the last days against the days before (needs the daily points). */
  trend: CostTrend | null;
  spendPerDay: number | null;
  /** The reason the verdict rests on, word for word one of `reasons`. */
  decision: string | null;
};

export type RowContext = {
  ref: Reference;
  /** Days in the period, for the budget per day. */
  days?: number | null;
  /** The account's cost per delivered order, used as the target when the margin cannot be computed. */
  accountCpd?: number | null;
  daily?: DayPoint[];
  /**
   * Set when the row is the whole account: it gets no budget step of its own
   * (budgets are set line by line), and it is only "scale" when a line is.
   */
  account?: { anyScale: boolean };
};

export type TrackingSetup = { metaPixel: boolean; tiktokPixel: boolean; metaCapi: boolean; tiktokEvents: boolean; purchaseAt: "placed" | "confirmed" | "delivered" };

export type SegmentKind = "governorate" | "device" | "hour" | "weekday";
/** One line of an audience table. `pending`: orders not called yet, left out of the confirmation rate when given. */
export type SegmentRow = { label: string; orders: number; confirmed: number; delivered: number; back: number; pending?: number };
export type SegmentFlag = "worse" | "better" | null;
export type SegmentRead = SegmentRow & {
  confirmRate: number | null;
  confirmCi: Interval | null;
  deliveryRate: number | null;
  deliveryCi: Interval | null;
  refusalRate: number | null;
  /** Probability that the segment's rate is under the rest's. */
  confirmProbWorse: number | null;
  deliveryProbWorse: number | null;
  confirmFlag: SegmentFlag;
  deliveryFlag: SegmentFlag;
};

export type AdMetric = "cost" | "orderRate" | "ctr" | "confirmRate" | "deliveryRate";
export type AdComparison = {
  key: string;
  label: string;
  /** Cost per delivered order (projection) for "cost", a rate otherwise. */
  value: number | null;
  low: number | null;
  high: number | null;
  /** Count behind it: projected deliveries, visits, impressions, calls or parcels. */
  n: number;
  /** Probability of being the best of these ads (lowest cost, highest rate). */
  probBest: number | null;
  enough: boolean;
};

export type AdviseInput = {
  /** Rows of one level: the campaigns, or the ads. */
  rows: AdRow[];
  costs: Costs;
  baseline: Baseline | null;
  /** Days in the period. */
  days: number;
  /** Daily points per row key, for fatigue. */
  daily?: Record<string, DayPoint[]>;
  tracking?: TrackingSetup;
  /** Recent orders, and how many carry a utm_source: tagging coverage. */
  coverage?: { orders: number; tagged: number };
  segments?: Partial<Record<SegmentKind, SegmentRow[]>>;
  /**
   * The source rows of the same period, spend typed without a campaign
   * included: what the overview's spend tile adds up. When given, the
   * account-wide statements (a platform's spend without a pixel, the spend
   * without platform figures) read their spend there, so they match the tile.
   */
  sources?: AdRow[];
  /** Confirmation by how long the first call took, for the calling insight. */
  callDelay?: CallDelayRow[];
};

export type Report = {
  rows: RowAdvice[];
  total: { row: AdRow; advice: RowAdvice; bottleneck: Bottleneck | null };
  /** Sorted: critical, warning, good, info; the biggest spend first within each. */
  insights: Insight[];
  /** Only when the rows are ads: the cost comparison. */
  ads: AdComparison[] | null;
};

// ── Text helpers ───────────────────────────────────────────────────────

const money = (m: number | null | undefined) => (m == null ? "—" : formatTND(m));
const pct = (x: number | null | undefined) => fmt(x, "pct");
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${fmt(Math.abs(x), "pct")}`;
const count = (n: number) => Math.round(n).toLocaleString("fr-FR");
/** A probability shown without false certainty: never "100 %" or "0 %". */
const chance = (p: number) => (p > 0.99 ? "plus de 99 %" : p < 0.01 ? "moins de 1 %" : pct(p));
const dec = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const name = (r: AdRow) => `« ${r.ad ?? r.campaign ?? r.source} »`;
/** "a", "a et b", "a, b et c". */
const joinFr = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}`);
/** The names of a few rows: "« a », « b » et 2 autres". */
function names(rows: AdRow[], max = 3): string {
  const shown = rows.slice(0, max).map(name);
  const more = rows.length - shown.length;
  return joinFr(more > 0 ? [...shown, plural(more, "autre", "autres")] : shown);
}

const STAGE_LABEL: Record<Stage, string> = {
  cpm: "CPM",
  ctr: "CTR lien",
  landing: "Clics arrivés",
  view: "Fiche vue",
  formStart: "Formulaire commencé",
  formCompletion: "Formulaire fini",
  confirmation: "Confirmation",
  delivery: "Livraison",
};
const STAGE_UNIT: Record<Stage, string> = {
  cpm: "affichages",
  ctr: "affichages",
  landing: "clics",
  view: "visites",
  formStart: "fiches vues",
  formCompletion: "formulaires commencés",
  confirmation: "commandes appelées",
  delivery: "colis arrivés au bout",
};
/** "X % contre Y % pour le reste du compte, sur N visites." A rule of thumb is never presented as the shop's own figure. */
function versus(label: string, rate: string, ref: string, r: RefValue, n: string): string {
  if (r.kind === "guide") return `${label} ${rate} sur ${n}, contre un repère courant de ${ref} (pas un chiffre de la boutique).`;
  return `${label} ${rate} contre ${ref} pour ${r.who ?? (r.kind === "shop" ? "la boutique" : "le reste du compte")}, sur ${n}.`;
}
/** Lowercase the first letter after a colon, unless the word is an acronym (CTR, CPM). */
const lowerFirst = (t: string) => (/^[A-ZÀ-Ý][A-ZÀ-Ý]/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));

const STAGE_TEXT: Record<Stage, { title: string; action: string; fix?: Fix }> = {
  cpm: { title: "Diffusion chère", action: "Élargir l'audience (ciblage large), regrouper les petits ensembles de publicités et laisser les placements automatiques." },
  ctr: { title: "La publicité n'arrête pas le défilement", action: "Tester 3 nouvelles accroches pour les 3 premières secondes (problème puis solution, démonstration, avant/après) en gardant la même audience.", fix: "brief" },
  landing: { title: "Des clics qui n'arrivent pas sur la boutique", action: "Ouvrir le lien de la publicité sur un téléphone en 4G : la fiche doit s'afficher en moins de 3 secondes. Vérifier les UTM du lien et retirer Audience Network.", fix: "links" },
  view: { title: "Les visiteurs n'ouvrent pas la fiche produit", action: "Faire pointer la publicité directement sur la fiche du produit montré, pas sur l'accueil.", fix: "links" },
  formStart: { title: "La fiche ne convainc pas", action: "Revoir l'offre et la confiance en haut de la fiche : prix clair, pack de 2 ou 3, vraies photos, paiement à la livraison et délai visibles. Le prix doit être celui de la publicité." },
  formCompletion: { title: "Le formulaire perd des clients", action: "Appeler dans la journée les formulaires commencés sans commande (leur numéro est gardé dans Commandes non terminées). Raccourcir le formulaire, essayer la saisie du téléphone sur un Android, afficher les frais de livraison avant le bouton.", fix: "carts" },
  confirmation: { title: "Trop de commandes non confirmées", action: "Appeler dans l'heure qui suit la commande. Si l'écart reste : audience trop large ou fausses commandes ; exclure les placements en cause et signaler l'achat aux publicités à la confirmation (Paramètres, carte « Pixels publicitaires »).", fix: "tracking" },
  delivery: { title: "Trop de colis refusés", action: "Montrer le vrai produit et le prix total dans la publicité, reconfirmer la veille de la livraison par appel ou SMS, vérifier les gouvernorats qui refusent le plus.", fix: "brief" },
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, good: 2, info: 3 };

// ── Stages and references ──────────────────────────────────────────────

const RATE_STAGES: Exclude<Stage, "cpm">[] = ["ctr", "landing", "view", "formStart", "formCompletion", "confirmation", "delivery"];
/** Stages the platform decides (what an impression costs, who clicks, how many clicks arrive): only compared within the same platform. */
const PLATFORM_STAGES = new Set<Stage>(["cpm", "ctr", "landing"]);

/**
 * The count behind one stage of a row; null when the figures it needs are
 * missing. The shop's funnel is made monotone first (an order implies a
 * started form, a started form a product view): a flow that skips an event
 * must not look like a leak. A row with orders but no visit recorded has no
 * visit stages at all.
 */
function stageCount(stage: Exclude<Stage, "cpm">, row: AdRow): Count | null {
  const f = row.funnel;
  const p = row.platform;
  const formStarts = Math.max(f.formStarts, f.orders);
  const productViews = Math.max(f.productViews, formStarts);
  const visits = f.sessions > 0;
  switch (stage) {
    case "ctr":
      return p.impressions != null && p.clicks != null ? { successes: p.clicks, n: p.impressions } : null;
    case "landing":
      return p.clicks != null && visits ? { successes: Math.min(f.sessions, p.clicks), n: p.clicks } : null;
    case "view":
      return visits ? { successes: Math.min(productViews, f.sessions), n: f.sessions } : null;
    case "formStart":
      return { successes: formStarts, n: productViews };
    case "formCompletion":
      return { successes: f.orders, n: formStarts };
    case "confirmation":
      return { successes: f.confirmed, n: Math.max(0, f.orders - pendingOf(f)) };
    case "delivery":
      return { successes: f.delivered, n: f.delivered + f.back };
  }
}

/** a − b, field by field: the rest of the account once a row is taken out. */
function subtract(a: AdRow, b: AdRow): AdRow {
  const funnel = { ...a.funnel };
  for (const k of Object.keys(funnel) as (keyof typeof funnel)[]) {
    const v = funnel[k];
    if (typeof v === "number") (funnel as Record<string, number>)[k] = Math.max(0, v - ((b.funnel[k] as number | undefined) ?? 0));
  }
  if (a.funnel.pending == null || b.funnel.pending == null) delete funnel.pending;
  const platform = { ...a.platform };
  for (const k of Object.keys(platform) as (keyof typeof platform)[]) {
    const av = a.platform[k];
    platform[k] = av == null ? null : Math.max(0, av - (b.platform[k] ?? 0));
  }
  return { ...a, funnel, platform };
}

/** Narrower groups a row is compared with before the rest of the account. */
export type Peers = {
  /** The other ads of the same campaign: same product and audience, the fairest yardstick for an ad. */
  campaign?: AdRow | null;
  /** The rest of the same platform, for the platform's stages (null: no other row on it). Absent: the rest of the account. */
  platform?: AdRow | null;
  /** How the text names that platform group ("le reste du compte Meta"). */
  platformWho?: string;
};

/**
 * What a row's stages are held against, like for like: the other ads of the
 * campaign when they have enough data, else the rest of the account (the
 * rest of the same platform for CPM, CTR and clicks arriving: a TikTok CPM
 * says nothing about Meta's), else the shop's own rates for confirmation
 * and delivery, else the general rule of thumb.
 */
export function reference(rest: AdRow | null, baseline: Baseline | null, peers: Peers = {}): Reference {
  const ref: Reference = {};
  const groups = (stage: Stage): { row: AdRow; kind: RefKind; who?: string }[] => {
    const out: { row: AdRow; kind: RefKind; who?: string }[] = [];
    if (peers.campaign) out.push({ row: peers.campaign, kind: "campaign", who: "les autres publicités de la campagne" });
    if (PLATFORM_STAGES.has(stage) && peers.platform !== undefined) {
      if (peers.platform) out.push({ row: peers.platform, kind: "platform", who: peers.platformWho });
    } else if (rest) out.push({ row: rest, kind: "account" });
    return out;
  };
  const pick = (stage: Stage, enough: (row: AdRow) => number | null): RefValue | null => {
    for (const g of groups(stage)) {
      const value = enough(g.row);
      if (value != null) return { value, kind: g.kind, who: g.who };
    }
    return null;
  };
  for (const stage of RATE_STAGES) {
    const found = pick(stage, (row) => {
      const c = stageCount(stage, row);
      return c && c.n >= REF_MIN[stage] ? Math.min(c.successes, c.n) / c.n : null;
    });
    if (found) ref[stage] = found;
    else if (stage === "confirmation" && baseline?.confirmRate != null) ref[stage] = { value: baseline.confirmRate, kind: "shop" };
    else if (stage === "delivery" && baseline?.deliveryRate != null) ref[stage] = { value: baseline.deliveryRate, kind: "shop" };
    else ref[stage] = { value: GUIDE[stage], kind: "guide" };
  }
  ref.viewOrder =
    pick("formStart", (row) => {
      const views = stageCount("formStart", row);
      return views && views.n >= REF_MIN.formStart ? row.funnel.orders / views.n : null;
    }) ?? { value: GUIDE.formStart * GUIDE.formCompletion, kind: "guide" };
  const cpm = pick("cpm", (row) =>
    row.platform.spend != null && row.platform.impressions != null && row.platform.impressions >= REF_MIN.cpm ? (row.platform.spend * 1000) / row.platform.impressions : null,
  );
  if (cpm) ref.cpm = cpm;
  return ref;
}

/**
 * The one stage that costs the row the most: of the stages significantly
 * under their reference, the one whose gap multiplies the cost per delivered
 * order the most (the cost is the spend divided by the product of every
 * stage's rate, so a stage at half its reference doubles it).
 */
export function bottleneck(row: AdRow, ref: Reference): Bottleneck | null {
  let best: Bottleneck | null = null;
  const consider = (b: Bottleneck) => {
    if (!best || b.factor > best.factor) best = b;
  };
  const p = row.platform;
  if (ref.cpm && p.spend != null && p.impressions != null && p.impressions >= STAGE_MIN.cpm) {
    const cpm = (p.spend * 1000) / p.impressions;
    if (cpm >= CPM_HIGH_FACTOR * ref.cpm.value) {
      consider({
        stage: "cpm",
        rate: cpm,
        reference: ref.cpm.value,
        referenceKind: ref.cpm.kind,
        factor: cpm / ref.cpm.value,
        n: p.impressions,
        title: STAGE_TEXT.cpm.title,
        evidence: versus("CPM", money(Math.round(cpm)), money(Math.round(ref.cpm.value)), ref.cpm, `${count(p.impressions)} affichages`),
        action: STAGE_TEXT.cpm.action,
      });
    }
  }
  // Fewer form starts than orders cannot happen in one coherent funnel: the visit and the order were attributed
  // differently. The form stages are then read together, as orders per product view.
  const formsTrusted = row.funnel.formStarts >= row.funnel.orders;
  for (const stage of RATE_STAGES) {
    if (stage === "formCompletion" && !formsTrusted) continue;
    const merged = stage === "formStart" && !formsTrusted;
    const views = stageCount(stage, row);
    const c = merged && views ? { successes: row.funnel.orders, n: views.n } : views;
    const r = merged ? ref.viewOrder : ref[stage];
    if (!c || !r || c.n < STAGE_MIN[stage]) continue;
    const threshold = r.kind === "guide" ? r.value : r.value * (1 - STAGE_TOLERANCE);
    const above = probRateAbove(c, threshold);
    if (above == null || above > STAGE_SIGNIFICANCE) continue;
    const rate = Math.min(c.successes, c.n) / c.n;
    consider({
      stage,
      rate,
      reference: r.value,
      referenceKind: r.kind,
      // A stage at 0 is capped: the comparison still ranks it first without an infinite cost.
      factor: rate > 0 ? r.value / rate : 100,
      n: c.n,
      title: STAGE_TEXT[stage].title,
      evidence: versus(merged ? "Commandes par fiche vue" : STAGE_LABEL[stage], pct(rate), pct(r.value), r, `${count(c.n)} ${STAGE_UNIT[stage]}`),
      action: STAGE_TEXT[stage].action,
    });
  }
  return best;
}

// ── Fatigue and recent trend ───────────────────────────────────────────

/**
 * Creative fatigue from daily points: the same people see the ad again, the
 * CTR falls, the platform charges more to find new ones (CPM up). Read on
 * the last 3 active days against the 7 before them. Null when there are not
 * enough days or volume to say anything.
 */
export function fatigue(points: DayPoint[], frequency: number | null = null): Fatigue | null {
  const active = points
    .filter((p) => (p.spend ?? 0) > 0 || (p.impressions ?? 0) > 0 || p.sessions > 0)
    .sort((a, b) => a.day.localeCompare(b.day));
  if (active.length < FATIGUE_RECENT_DAYS + 3) return null;
  const recent = active.slice(-FATIGUE_RECENT_DAYS);
  const base = active.slice(-FATIGUE_RECENT_DAYS - FATIGUE_BASE_DAYS, -FATIGUE_RECENT_DAYS);
  const sum = (xs: DayPoint[], f: (p: DayPoint) => number | null) => xs.reduce((s, p) => s + (f(p) ?? 0), 0);
  const all = (xs: DayPoint[], f: (p: DayPoint) => number | null) => xs.every((p) => f(p) != null);
  const trend = (b: number, r: number): Trend => ({ base: b, recent: r, change: b > 0 ? r / b - 1 : 0 });
  const window = `entre les ${base.length} jours d'avant et les ${recent.length} derniers jours`;
  const freqText = frequency != null ? `, fréquence ${dec(frequency)}` : "";
  const hasSpend = all([...base, ...recent], (p) => p.spend);

  const platform = all([...base, ...recent], (p) => p.impressions) && all([...base, ...recent], (p) => p.clicks);
  const bImp = sum(base, (p) => p.impressions);
  const rImp = sum(recent, (p) => p.impressions);
  if (platform && bImp >= FATIGUE_MIN_IMPRESSIONS.base && rImp >= FATIGUE_MIN_IMPRESSIONS.recent) {
    const bClk = sum(base, (p) => p.clicks);
    const rClk = sum(recent, (p) => p.clicks);
    const ctr = trend(bClk / bImp, rClk / rImp);
    const cpm = hasSpend ? trend((sum(base, (p) => p.spend) * 1000) / bImp, (sum(recent, (p) => p.spend) * 1000) / rImp) : null;
    const drop = -ctr.change;
    const real = (probBeats({ successes: bClk, n: bImp }, { successes: rClk, n: rImp }) ?? 0) >= FATIGUE_SIGNIFICANCE;
    const confirmed = (cpm != null && cpm.change >= FATIGUE_CPM_RISE) || (frequency ?? 0) >= FATIGUE_FREQUENCY;
    const level = real && drop >= FATIGUE_CTR_DROP && confirmed ? "clear" : real && drop >= FATIGUE_EARLY_DROP ? "early" : "none";
    const cpmText = cpm ? `, CPM ${money(Math.round(cpm.base))} → ${money(Math.round(cpm.recent))} (${signed(cpm.change)})` : "";
    return {
      level,
      basis: "platform",
      ctr,
      cpm,
      costPerVisit: null,
      orderRate: null,
      frequency,
      evidence: level === "none" ? "" : `CTR ${pct(ctr.base)} → ${pct(ctr.recent)} (${signed(ctr.change)})${cpmText} ${window}${freqText}.`,
    };
  }

  const bSes = sum(base, (p) => p.sessions);
  const rSes = sum(recent, (p) => p.sessions);
  if (!hasSpend || bSes < FATIGUE_MIN_SESSIONS.base || rSes < FATIGUE_MIN_SESSIONS.recent) return null;
  const cpv = trend(sum(base, (p) => p.spend) / bSes, sum(recent, (p) => p.spend) / rSes);
  const orderRate = trend(sum(base, (p) => p.orders) / bSes, sum(recent, (p) => p.orders) / rSes);
  // Without impressions the cause cannot be told apart (CTR or CPM): never more than "early".
  const level = cpv.change >= FATIGUE_COST_RISE ? "early" : "none";
  return {
    level,
    basis: "visits",
    ctr: null,
    cpm: null,
    costPerVisit: cpv,
    orderRate,
    frequency,
    evidence:
      level === "none"
        ? ""
        : `Coût par visite ${money(Math.round(cpv.base))} → ${money(Math.round(cpv.recent))} (${signed(cpv.change)}) ${window}${freqText}. Sans les chiffres de la plateforme, impossible de dire si c'est le CTR ou le CPM.`,
  };
}

/**
 * The cost per placed order of the last TREND_RECENT_DAYS days against the
 * days of the period before them, on the days whose spend is known. Null
 * when either side has too few orders to say anything. Placed orders, not
 * deliveries: a day carries no count of its open orders, so the last days'
 * deliveries cannot be projected apart from the older ones'.
 */
export function costTrend(points: DayPoint[]): CostTrend | null {
  const sorted = [...points].sort((a, b) => a.day.localeCompare(b.day));
  if (sorted.length <= TREND_RECENT_DAYS) return null;
  const window = (xs: DayPoint[]): TrendWindow => {
    const known = xs.filter((p) => p.spend != null);
    const spend = known.reduce((s, p) => s + (p.spend ?? 0), 0);
    const orders = known.reduce((s, p) => s + p.orders, 0);
    return { days: known.length, spend, orders, cpa: orders > 0 ? Math.round(spend / orders) : 0 };
  };
  const base = window(sorted.slice(0, -TREND_RECENT_DAYS));
  const recent = window(sorted.slice(-TREND_RECENT_DAYS));
  if (base.orders < TREND_MIN_ORDERS || recent.orders < TREND_MIN_ORDERS || !(base.spend > 0) || !(recent.spend > 0)) return null;
  const change = recent.spend / recent.orders / (base.spend / base.orders) - 1;
  // Orders are counts in the spend: the probability that the days before were truly cheaper per order.
  const probWorse = probBestCost([{ events: base.orders, spend: base.spend }, { events: recent.orders, spend: recent.spend }])[0] ?? 0;
  return { base, recent, change, probWorse, worse: change >= TREND_RISE && probWorse >= TREND_SIGNIFICANCE };
}

// ── One row ────────────────────────────────────────────────────────────

/** Days of the row with some spend; null when no day says what was spent. */
function daysOfSpend(points: DayPoint[] | undefined): number | null {
  if (!points || !points.some((p) => p.spend != null)) return null;
  return points.filter((p) => (p.spend ?? 0) > 0).length;
}

/**
 * What the row spends a day now: the average of its last days with a known
 * spend, when the days are given (a campaign started at the end of a 30-day
 * period spends far more a day than its total / 30); else the period's average.
 */
function currentSpendPerDay(spend: number | null, days: number | null | undefined, points: DayPoint[] | undefined): number | null {
  const known = (points ?? []).filter((p) => p.spend != null).sort((a, b) => a.day.localeCompare(b.day));
  if (known.length > 0) {
    const last = known.slice(-BUDGET_DAYS);
    return Math.round(last.reduce((s, p) => s + (p.spend ?? 0), 0) / last.length);
  }
  return spend != null && days ? Math.round(spend / days) : null;
}

/**
 * The verdict for one row. Order of the questions: is there spend at all, is
 * the measure broken, does a delivered order leave any margin, is there
 * enough evidence, and then the money: how likely is the true cost per
 * delivered order under the max. A budget change is a percentage of a
 * campaign's budget; an ad only gets "switch off" (budgets live on its ad
 * set), the whole account none (it is the sum of its lines).
 */
export function adviseRow(row: AdRow, k: Kpis, ctx: RowContext): RowAdvice {
  const f = row.funnel;
  const spend = row.platform.spend;
  const proj = k.projection;
  const delivered = proj?.delivered ?? f.delivered;
  const judgedCpd = spend != null && delivered > 0 ? Math.round(spend / delivered) : null;
  const spendPerDay = currentSpendPerDay(spend, ctx.days, ctx.daily);
  const fat = ctx.daily ? fatigue(ctx.daily, k.frequency) : null;
  const trend = ctx.daily ? costTrend(ctx.daily) : null;
  const neck = bottleneck(row, ctx.ref);
  const reasons: string[] = [];
  let decision: string | null = null;
  // The sentence the verdict rests on is also kept apart: the account's headline repeats it.
  const decide = (t: string) => {
    decision = t;
    reasons.push(t);
  };
  const unit: "budget" | "ad" | "account" = ctx.account ? "account" : row.level === "ad" ? "ad" : "budget";
  const account = unit === "account";
  const budget = (change: number): number | null => (unit === "budget" || (unit === "ad" && change === CUT_STEP) ? change : null);
  const out = (verdict: Advice["verdict"], confidence: Advice["confidence"], budgetChange: number | null, extra: Partial<RowAdvice> = {}): RowAdvice => ({
    key: row.key,
    verdict,
    confidence,
    budgetChange,
    reasons,
    kpis: k,
    target: null,
    targetBasis: null,
    judgedCpd,
    probProfitable: null,
    moreSpend: null,
    bottleneck: neck,
    fatigue: fat,
    trend,
    spendPerDay,
    decision,
    ...extra,
  });

  if (spend == null || spend === 0) {
    decide(spend == null ? `Pas de dépense saisie ou importée pour ${account ? "le compte" : "cette ligne"} : son coût ne peut pas être jugé.` : "Aucune dépense sur la période.");
    return out("wait", "low", null);
  }

  // The measure is broken: money goes out and the shop sees no visit, or almost none of the clicks.
  // Orders without any visit are different: the orders carry the attribution, the visits were not recorded
  // (ad-level visits only carry utm_content since it is captured), so the row is judged on its orders.
  const visitsMissing = f.sessions === 0 && f.orders > 0;
  if (f.sessions === 0 && f.orders === 0 && spend >= TRACKING_MIN_SPEND) {
    decide(
      account
        ? `${money(spend)} dépensés et aucune visite venue des publicités : les liens n'ont pas les bons UTM, ou les noms ne correspondent pas aux dépenses saisies.`
        : `${money(spend)} dépensés et aucune visite avec ce nom : le lien n'a pas les bons UTM, ou le nom ne correspond pas à la dépense saisie.`,
    );
    return out("tracking", spend >= 3 * TRACKING_MIN_SPEND ? "high" : "medium", null, { bottleneck: null });
  }
  if (!visitsMissing && row.platform.clicks != null && row.platform.clicks >= TRACKING_MIN_CLICKS && k.landingRate != null && k.landingRate < TRACKING_LANDING_FLOOR) {
    decide(
      `${plural(row.platform.clicks, "clic compté", "clics comptés")} par la plateforme, ${plural(f.sessions, "visite", "visites")} dans la boutique (${pct(k.landingRate)}) : ${account ? "les UTM des liens ne correspondent pas, ou des liens sont cassés" : "les UTM du lien ne correspondent pas, ou le lien est cassé"}.`,
    );
    return out("tracking", "medium", null, { bottleneck: null });
  }

  // A delivered order already loses money before any ad.
  if (k.marginPerDelivered != null && k.marginPerDelivered <= 0) {
    decide(`Chaque commande livrée perd déjà ${money(-k.marginPerDelivered)} avant la publicité : revoir le prix, le coût fournisseur ou les frais de livraison avant de dépenser.`);
    return out("fix", k.marginBasis === "shop" || k.marginBasis === "account" ? "medium" : "high", budget(CUT_STEP), { target: 0, targetBasis: "margin" });
  }

  const fromMargin = k.breakEvenCpd != null && k.breakEvenCpd > 0;
  const target = fromMargin ? k.breakEvenCpd : (ctx.accountCpd ?? null);
  const basis: RowAdvice["targetBasis"] = target == null ? null : fromMargin ? "margin" : "account";
  if (target == null) {
    const costs = k.missing.filter((m) => m === "productCost" || m === "carrierCost" || m === "returnCost").map((m) => INPUT_LABELS[m]);
    decide(costs.length ? `Impossible de calculer le coût max par livrée : ${costs.join(", ")}.` : "Pas encore de livrée ni de marge connue : rien pour juger le coût.");
    return out("wait", "low", budget(0));
  }

  const young = (k.openShare ?? 0) > YOUNG_OPEN_SHARE;
  const cpdText = judgedCpd != null ? `${proj?.projected ? "Coût par livrée projeté" : "Coût par livrée"} : ${money(judgedCpd)}` : `Aucune livrée${proj?.projected ? " projetée" : ""} pour ${money(spend)} dépensés`;
  reasons.push(
    basis === "account"
      ? `${cpdText}, contre ${money(target)} en moyenne sur le compte (les coûts manquent pour calculer la marge).`
      : `${cpdText}, pour un maximum de ${money(target)}.`,
  );
  if (f.orders > 0) reasons.push(`${plural(f.orders, "commande", "commandes")}, ${plural(f.delivered, "livrée", "livrées")}, ${count(f.open)} en cours.`);
  if (young) reasons.push(`${pct(k.openShare)} des commandes sont encore en cours : chiffres de livraison en partie projetés.`);
  if (fat && fat.level !== "none") reasons.push(`La publicité s'use : ${lowerFirst(fat.evidence)}`);
  if (visitsMissing) reasons.push(`Aucune visite comptée pour ${account ? "le compte" : "cette ligne"} alors que ses commandes le sont : ${account ? "jugé" : "jugée"} sur ses commandes seulement.`);

  const enough = spend >= JUDGE_SPEND_MULTIPLE * target || f.orders >= JUDGE_MIN_ORDERS;
  if (!enough) {
    const moreSpend = Math.max(0, Math.round(JUDGE_SPEND_MULTIPLE * target - spend));
    decide(`Pas encore assez de données : juger après environ ${money(moreSpend)} de plus, ou ${JUDGE_MIN_ORDERS} commandes.`);
    if (f.orders === 0 && spend >= target) {
      reasons.push(`Aucune commande pour l'instant : si rien n'arrive avant ${money(Math.round(JUDGE_SPEND_MULTIPLE * target))} dépensés, ${account ? "mettre les publicités en pause et vérifier leurs liens" : "couper"}.`);
    }
    return out("wait", "low", budget(0), { target, targetBasis: basis, moreSpend });
  }

  const p = probCostUnder(delivered, spend, target) ?? 0;
  reasons.push(`Probabilité d'être sous ${basis === "account" ? "la moyenne du compte" : "le coût max"} : ${chance(p)}.`);
  if (k.cpaPlaced != null && judgedCpd != null && proj?.netDeliveryRate != null && proj.netDeliveryRate < PLACED_LIE_RATE && f.orders >= 5) {
    reasons.push(`CPA ${money(k.cpaPlaced)} par commande passée, mais ${money(judgedCpd)} par livrée : seules ${pct(proj.netDeliveryRate)} des commandes ${proj.projected ? "devraient finir livrées (projection)" : "finissent livrées"}.`);
  }
  const certainty = Math.max(p, 1 - p);
  let confidence: Advice["confidence"] = certainty >= HIGH_CERTAINTY && (f.orders >= HIGH_ORDERS || spend >= HIGH_SPEND_MULTIPLE * target) ? "high" : certainty >= MEDIUM_CERTAINTY ? "medium" : "low";
  if (young && confidence === "high") confidence = "medium";
  if (basis === "account") confidence = "low";
  const base = { target, targetBasis: basis, probProfitable: p };
  const share = judgedCpd != null ? judgedCpd / target : Infinity;

  // No margin: the row can be ranked against the account's average, never called profitable or lost.
  // Scaling the cheapest line of a losing account burns money; pausing the dearest of a profitable one loses sales.
  if (basis === "account") {
    if (p >= WIN_PROB) {
      decide("Moins chère par livrée que la moyenne du compte, mais sans la marge rien ne dit qu'elle est rentable : garder le budget et renseigner les coûts.");
      return out("keep", confidence, budget(0), base);
    }
    if (p <= LOSE_PROB) {
      decide(
        unit === "ad"
          ? "Plus chère par livrée que la moyenne du compte : laisser les autres publicités de l'ensemble prendre son budget, et renseigner les coûts pour savoir si elle perd de l'argent."
          : "Plus chère par livrée que la moyenne du compte : réduire de 30 % au profit des lignes les moins chères, et renseigner les coûts pour savoir si elle perd de l'argent.",
      );
      return out("fix", confidence, budget(FIX_STEP), base);
    }
    decide("Proche de la moyenne du compte : garder le budget en attendant les coûts.");
    return out("keep", confidence, budget(0), base);
  }

  if (p >= WIN_PROB && share <= SCALE_MAX_SHARE) {
    // The account goes up exactly when one of its lines does, and only those lines: each passed its own checks below.
    if (account && ctx.account?.anyScale) {
      decide("Rentable dans l'ensemble : monter seulement les lignes marquées « monter », chacune par palier.");
      return out("scale", confidence, null, base);
    }
    if (fat && fat.level !== "none") {
      decide("Rentable, mais la publicité s'use : renouveler la créative avant de monter le budget.");
      return out("keep", confidence, budget(0), base);
    }
    if (trend?.worse) {
      decide(
        `Rentable sur la période, mais les ${TREND_RECENT_DAYS} derniers jours coûtent ${money(trend.recent.cpa)} par commande contre ${money(trend.base.cpa)} avant (${signed(trend.change)}) : ne pas monter tant que la hausse n'est pas expliquée.`,
      );
      return out("keep", confidence, budget(0), base);
    }
    if (k.frequency != null && k.frequency >= SATURATED_FREQUENCY) {
      decide(`Rentable, mais la fréquence atteint ${dec(k.frequency)} : élargir l'audience avant de monter le budget.`);
      return out("keep", confidence, budget(0), base);
    }
    const spent = daysOfSpend(ctx.daily);
    if (spent != null && spent < MIN_SCALE_DAYS) {
      decide(`Rentable, mais sur ${plural(spent, "jour", "jours")} de dépense seulement : attendre ${MIN_SCALE_DAYS} jours avant de monter, les premiers jours varient beaucoup.`);
      return out("keep", confidence, budget(0), base);
    }
    const net = proj?.netDeliveryRate ?? null;
    if (net != null && net < FRAGILE_NET_RATE && f.orders >= JUDGE_MIN_ORDERS) {
      decide(`Rentable sur le papier, mais seules ${pct(net)} des commandes ${proj?.projected ? "devraient finir livrées" : "finissent livrées"} : environ ${dec(1 / net)} commandes à appeler et à préparer pour une vente. Corriger d'abord les annulations et les refus, puis monter.`);
      return out("keep", confidence, budget(0), base);
    }
    if (f.orders > 0 && k.pending / f.orders > PENDING_SCALE_SHARE) {
      decide(`Rentable sur le papier, mais ${plural(k.pending, "commande", "commandes")} sur ${count(f.orders)} ${pluralWord(k.pending, "n'a", "n'ont")} pas encore été ${pluralWord(k.pending, "appelée", "appelées")} : attendre les appels de confirmation avant de monter.`);
      return out("keep", confidence, budget(0), base);
    }
    if (account) {
      decide("Rentable dans l'ensemble, mais aucune ligne n'est assez sûre pour monter seule : garder les budgets.");
      return out("keep", confidence, null, base);
    }
    // More budget reaches wider, colder people: a row whose orders already confirm or deliver badly only takes the small step.
    const weakBuyers = neck != null && (neck.stage === "confirmation" || neck.stage === "delivery");
    const big = p >= BIG_SCALE_PROB && share <= BIG_SCALE_MAX_SHARE && !young && !weakBuyers && confidence === "high";
    const step = big ? BIG_SCALE_STEP : SCALE_STEP;
    decide(
      unit === "ad"
        ? `Gagnante : la garder active et couper les publicités perdantes de son ensemble, pour qu'elle prenne leur budget. Le budget se règle sur l'ensemble : au plus +${step} %, puis 3 jours d'attente.`
        : `Gagnante : monter le budget de ${step} %, pas plus, puis attendre 3 jours avant le palier suivant.`,
    );
    if (neck) reasons.push(`À améliorer en même temps : ${lowerFirst(neck.title)}. ${neck.evidence}`);
    return out("scale", confidence, budget(step), base);
  }
  if (share <= 1) {
    decide(share > SCALE_MAX_SHARE ? "Rentable, sans assez de marge pour monter : garder le budget." : "Sous le coût max, mais pas encore assez sûr pour monter : garder le budget.");
    if (neck) reasons.push(`À améliorer : ${lowerFirst(neck.title)}. ${neck.evidence}`);
    return out("keep", confidence, budget(0), base);
  }
  // Over the max. Fixing is worth it only when the weak stage, brought back to its reference, would be enough.
  const fixable = neck != null && neck.stage !== "cpm" && judgedCpd != null && judgedCpd / neck.factor <= target;
  if (p <= LOSE_PROB) {
    if (fixable && neck) {
      decide(`À corriger : ${lowerFirst(neck.title)}. Corrigé, le coût par livrée serait d'environ ${money(Math.round(judgedCpd! / neck.factor))}.`);
      return out("fix", confidence, budget(FIX_STEP), base);
    }
    if (f.orders === 0) reasons.push(`${money(spend)} dépensés sans commande : à ce coût, environ ${plural(spend / target, "livrée était attendue", "livrées étaient attendues")}.`);
    decide(
      unit === "ad"
        ? "Perdante : la désactiver ; les autres publicités de l'ensemble reprennent son budget."
        : account
          ? "Le compte perd de l'argent : couper les lignes perdantes, corriger les autres, et ne garder telles quelles que celles sous le coût max."
          : "Perdante : la mettre en pause et reporter le budget sur les gagnantes.",
    );
    if (neck) reasons.push(`Là où les clients se perdent : ${lowerFirst(neck.evidence)}`);
    return out("cut", confidence, budget(CUT_STEP), base);
  }
  const near = share <= NEAR_MAX_SHARE;
  if (neck) {
    const fixed = judgedCpd != null && neck.stage !== "cpm" ? ` Corrigé, le coût par livrée serait d'environ ${money(Math.round(judgedCpd / neck.factor))}.` : "";
    decide(`À corriger : ${lowerFirst(neck.title)}.${fixed}`);
    return out("fix", confidence, budget(near ? NEAR_STEP : FIX_STEP), base);
  }
  if (near) {
    decide(
      unit === "budget"
        ? "Un peu au-dessus du coût max : réduire de 20 % et tester une nouvelle créative."
        : unit === "ad"
          ? "Un peu au-dessus du coût max : lancer une nouvelle créative à côté, dans le même ensemble."
          : "Un peu au-dessus du coût max : réduire les lignes les plus chères et tester de nouvelles créatives.",
    );
    return out("keep", confidence, budget(NEAR_STEP), base);
  }
  decide(
    `Au-dessus du coût max sans étape nettement plus faible que ${account ? "les taux habituels de la boutique" : "le reste"} : tester de nouvelles créatives, ou une offre (pack) qui augmente la marge.`,
  );
  return out("fix", confidence, budget(FIX_STEP), base);
}

// ── Account, tracking, money ───────────────────────────────────────────

type Weighted = { insight: Insight; weight: number };

/** Critical first, then warnings, wins, information; within each, as given. */
export function sortInsights(insights: Insight[]): Insight[] {
  return insights.map((x, i) => ({ x, i })).sort((a, b) => SEVERITY_RANK[a.x.severity] - SEVERITY_RANK[b.x.severity] || a.i - b.i).map((x) => x.x);
}

/** How the shop's orders are named next to a platform's purchase count: those the platform was told about. */
const REPORTED_WORDS: Record<TrackingSetup["purchaseAt"], [string, string]> = {
  placed: ["commande réelle", "commandes réelles"],
  confirmed: ["commande confirmée", "commandes confirmées"],
  delivered: ["commande livrée", "commandes livrées"],
};

function rowInsights(row: AdRow, a: RowAdvice, purchaseAt: TrackingSetup["purchaseAt"] = "placed"): Insight[] {
  const out: Insight[] = [];
  const k = a.kpis;
  const evidence = a.reasons.slice(0, 3).join(" ");
  const perDay = (step: number) => (a.spendPerDay != null ? ` (environ ${step > 0 ? "+" : "−"}${money(Math.round((a.spendPerDay * Math.abs(step)) / 100))} par jour)` : "");
  if (a.verdict === "tracking") {
    // The parameters the row is matched on, down to its level: an ad also needs its utm_content.
    const params = [`utm_source=${row.source}`, ...(row.campaign ? [`utm_campaign=${row.campaign}`] : []), ...(row.level === "ad" && row.ad ? [`utm_content=${row.ad}`] : [])];
    out.push({ severity: "critical", key: row.key, title: `${name(row)} : les visites ne sont pas comptées`, evidence: a.reasons[0], action: `Vérifier que le lien de la publicité contient ${joinFr(params)}, exactement comme la dépense saisie ; le recréer avec le générateur de liens.`, fix: "links" });
  } else if (a.verdict === "cut") {
    const lost = a.bottleneck ? ` Là où les clients se perdent : ${lowerFirst(a.bottleneck.evidence)}` : "";
    out.push({ severity: "critical", key: row.key, title: `Couper ${name(row)}`, evidence: `${evidence}${lost}`, action: "Mettre en pause. Garder l'angle si les clics étaient bons, et reporter le budget sur les gagnantes." });
  } else if (a.verdict === "scale" && row.level === "ad") {
    out.push({ severity: "good", key: row.key, title: `${name(row)} est gagnante`, evidence, action: "La garder active et couper les publicités perdantes de son ensemble pour qu'elle prenne leur budget ; monter ensuite le budget de l'ensemble par paliers de 20 %, tous les 3 jours. Tester 2 variantes de son accroche.", fix: "brief" });
  } else if (a.verdict === "scale") {
    // A winner can still leak at one stage: say it next to the step up, where the owner reads.
    const also = a.bottleneck ? ` En même temps, ${lowerFirst(a.bottleneck.title)} : ${lowerFirst(a.bottleneck.action)}` : "";
    out.push({ severity: "good", key: row.key, title: `Monter ${name(row)}`, evidence, action: `Augmenter le budget de ${a.budgetChange} %${perDay(a.budgetChange ?? 0)}, puis attendre 3 jours avant le palier suivant. Ne pas dupliquer l'ensemble de publicités.${also}`, fix: a.bottleneck ? STAGE_TEXT[a.bottleneck.stage].fix : undefined });
  } else if (a.verdict === "fix") {
    const neck = a.bottleneck;
    const stop =
      a.budgetChange === CUT_STEP
        ? "Mettre en pause le temps de corriger."
        : a.budgetChange == null
          ? "Si son ensemble a des publicités rentables, la désactiver en attendant."
          : `Réduire le budget de ${Math.abs(a.budgetChange)} %${perDay(a.budgetChange)} le temps de corriger.`;
    if (k.marginPerDelivered != null && k.marginPerDelivered <= 0) {
      out.push({ severity: "critical", key: row.key, title: `${name(row)} perd de l'argent avant la publicité`, evidence: a.reasons[0], action: `${stop} Voir l'onglet Seuils pour le prix ou le pack qui redonne de la marge.`, fix: "productCost" });
    } else {
      out.push({ severity: "warning", key: row.key, title: `${name(row)} : ${neck ? lowerFirst(neck.title) : "trop cher par livrée"}`, evidence: neck ? `${neck.evidence} ${a.reasons[0]}` : evidence, action: `${neck ? neck.action : "Tester 2 à 3 nouvelles créatives, ou une offre qui augmente la marge."} ${stop}`, fix: neck ? STAGE_TEXT[neck.stage].fix : "brief" });
    }
  } else if (a.bottleneck && a.verdict === "keep") {
    out.push({ severity: "info", key: row.key, title: `${name(row)} : ${lowerFirst(a.bottleneck.title)}`, evidence: a.bottleneck.evidence, action: a.bottleneck.action, fix: STAGE_TEXT[a.bottleneck.stage].fix });
  }
  // Profitable over the period, dearer lately: the hold is said where the owner reads, with both figures.
  if (a.trend?.worse && a.verdict === "keep" && (a.probProfitable ?? 0) >= WIN_PROB) {
    const t = a.trend;
    out.push({
      severity: "warning",
      key: row.key,
      title: `${name(row)} coûte plus cher depuis ${TREND_RECENT_DAYS} jours`,
      evidence: `${money(t.recent.cpa)} par commande sur les ${TREND_RECENT_DAYS} derniers jours (${plural(t.recent.orders, "commande", "commandes")}), contre ${money(t.base.cpa)} avant (${plural(t.base.days, "jour", "jours")}, ${plural(t.base.orders, "commande", "commandes")}) : ${signed(t.change)}.${k.breakEvenCpa != null ? ` CPA max : ${money(k.breakEvenCpa)}.` : ""}`,
      action:
        row.level === "ad"
          ? "Ne pas lui donner plus de budget. Chercher ce qui a changé ces jours-là (audience, prix, page) ; si la hausse dure encore 3 jours, lancer une nouvelle créative à côté."
          : "Ne pas monter le budget. Chercher ce qui a changé ces jours-là (créative, audience, prix, page) ; si la hausse dure encore 3 jours, réduire le budget de 20 %.",
    });
  }
  if (a.fatigue && a.fatigue.level !== "none") {
    out.push({
      severity: a.fatigue.level === "clear" ? "warning" : "info",
      key: row.key,
      title: `${name(row)} s'use`,
      evidence: a.fatigue.evidence,
      action: "Préparer 2 à 3 nouvelles accroches sur le même angle et les lancer dans le même ensemble ; ne pas monter le budget avant.",
      fix: "brief",
    });
  }
  const purchases = row.platform.purchases;
  if (purchases != null && k.overReporting != null && purchases >= REPORT_MIN_EVENTS && k.overReporting >= OVER_REPORT_RATIO) {
    const real = reportedOrders(row.funnel, purchaseAt);
    out.push({
      severity: "warning",
      key: row.key,
      title: `${name(row)} : la plateforme compte trop d'achats`,
      evidence: `${count(purchases)} achats comptés par la plateforme pour ${plural(real, ...REPORTED_WORDS[purchaseAt])}${purchaseAt === "delivered" ? "" : `, dont ${plural(row.funnel.delivered, "livrée", "livrées")}`}.`,
      action: "Juger cette ligne sur le coût par livrée de cette page, pas sur le coût par achat du gestionnaire de publicités.",
    });
  }
  return out;
}

/**
 * Inputs the owner has not given, each with where to give it. `spend` is the
 * account's, as the overview's tile counts it; `sources`, when given, tells a
 * campaign with no spend of its own from one whose platform has spend typed
 * without a campaign (that spend is entered, only not per campaign).
 */
function missingInsights(rows: AdRow[], total: AdRow, k: Kpis, costs: Costs, spend: number, sources?: AdRow[]): Weighted[] {
  const out: Weighted[] = [];
  if (costs.carrierPerParcel == null) {
    out.push({ weight: spend, insight: { severity: "warning", key: null, title: "Coût du transporteur manquant", evidence: `${plural(total.funnel.shipped, "colis envoyé", "colis envoyés")} sur la période sans coût de transport connu : ni la marge par livrée ni le coût max par livrée ne peuvent être calculés, les lignes sont comparées à la moyenne du compte.`, action: "Renseigner ce que le transporteur facture par colis dans Paramètres, carte « Livraison ».", fix: "costs" } });
  }
  if (costs.returnPerParcel == null && total.funnel.back > 0) {
    const back = total.funnel.back;
    out.push({ weight: spend, insight: { severity: "warning", key: null, title: "Coût d'un retour manquant", evidence: `${plural(back, "colis est revenu", "colis sont revenus")} sur la période ; ${pluralWord(back, "son", "leur")} coût de retour n'est pas connu.`, action: "Renseigner le coût en plus d'un colis refusé ou retourné dans Paramètres, carte « Livraison » (0 si le transporteur ne le facture pas).", fix: "costs" } });
  }
  if (total.funnel.costUnknownDelivered > 0) {
    const unknown = total.funnel.costUnknownDelivered;
    out.push({ weight: spend, insight: { severity: "warning", key: null, title: "Coût fournisseur manquant", evidence: `${plural(unknown, "commande livrée n'a", "commandes livrées n'ont")} pas de coût fournisseur : ${pluralWord(unknown, "sa", "leur")} marge ne peut pas être calculée.`, action: "Renseigner le coût fournisseur sur la fiche de chaque produit concerné, dans Produits.", fix: "productCost" } });
  }
  const typedWithoutCampaign = (source: string) => {
    const all = sources?.find((r) => r.source === source)?.platform.spend ?? 0;
    return all - rows.filter((r) => r.source === source).reduce((s, r) => s + (r.platform.spend ?? 0), 0) > 0;
  };
  const unpaid = rows.filter(
    (r) => r.platform.spend == null && (META_SOURCES.has(r.source.toLowerCase()) || TIKTOK_SOURCES.has(r.source.toLowerCase())) && (r.funnel.sessions > 0 || r.funnel.orders > 0) && !typedWithoutCampaign(r.source),
  );
  if (unpaid.length > 0) {
    const sessions = unpaid.reduce((s, r) => s + r.funnel.sessions, 0);
    const orders = unpaid.reduce((s, r) => s + r.funnel.orders, 0);
    out.push({
      weight: spend,
      insight: {
        severity: "warning",
        key: null,
        title: "Dépenses manquantes",
        evidence: `${names(unpaid)} : ${plural(sessions, "visite", "visites")} et ${plural(orders, "commande venue", "commandes venues")} de publicités sans dépense saisie.`,
        action: "Importer l'export Meta ou TikTok, ou saisir la dépense dans Dépenses pub.",
        fix: "import",
      },
    });
  }
  if (spend > 0 && k.missing.includes("impressions") && [...rows, ...(sources ?? [])].every((r) => r.platform.impressions == null)) {
    out.push({ weight: 0, insight: { severity: "info", key: null, title: "Chiffres de la plateforme absents", evidence: `${money(spend)} dépensés sans affichages ni clics importés : le CTR, le CPM et l'usure des publicités ne peuvent pas être calculés.`, action: "Importer l'export du gestionnaire de publicités Meta ou TikTok.", fix: "import" } });
  }
  return out;
}

/**
 * The checks on the measure itself: a pixel, its server link, when it is
 * told about a purchase (and whether the purchase arrives in time to be
 * credited to an ad), whether the platform's count matches the shop's
 * orders at that stage, whether the orders carry their source, and the
 * clean buyer audience a lookalike can start from. `rows` give each
 * platform's spend: pass the source rows (spend typed without a campaign
 * included) so the figures match the overview's spend tile. `baseline` gives
 * the delay to delivery and the shop's volume of buyers.
 */
export function trackingInsights(rows: AdRow[], total: AdRow, k: Kpis, setup?: TrackingSetup, coverage?: { orders: number; tagged: number }, days?: number | null, baseline?: Baseline | null): Insight[] {
  const out: Insight[] = [];
  const spendOf = (set: Set<string>) => rows.filter((r) => set.has(r.source.toLowerCase())).reduce((s, r) => s + (r.platform.spend ?? 0), 0);
  const spend = rows.reduce((s, r) => s + (r.platform.spend ?? 0), 0);
  const metaSpend = spendOf(META_SOURCES);
  const tiktokSpend = spendOf(TIKTOK_SOURCES);
  const deliveredPerWeek = days && days > 0 ? (total.funnel.delivered * 7) / days : null;
  const stage = (s: TrackingSetup["purchaseAt"]) => (s === "confirmed" ? "confirmation" : "livraison");

  if (setup) {
    const platforms: { label: string; spend: number; pixel: boolean; server: boolean; serverName: string; serverTitle: string }[] = [
      { label: "Meta", spend: metaSpend, pixel: setup.metaPixel, server: setup.metaCapi, serverName: "l'API Conversions", serverTitle: "API Conversions Meta non reliée" },
      { label: "TikTok", spend: tiktokSpend, pixel: setup.tiktokPixel, server: setup.tiktokEvents, serverName: "l'Events API", serverTitle: "Events API TikTok non reliée" },
    ];
    for (const pl of platforms) {
      if (pl.spend <= 0) continue;
      if (!pl.pixel) {
        out.push({ severity: "critical", key: null, title: `Pixel ${pl.label} absent`, evidence: `${money(pl.spend)} dépensés sur ${pl.label} sans pixel : l'algorithme ne sait pas qui achète et cherche des clics, pas des acheteurs.`, action: `Coller l'identifiant du pixel ${pl.label} dans Paramètres, carte « Pixels publicitaires ».`, fix: "tracking" });
      } else if (!pl.server && setup.purchaseAt !== "placed") {
        out.push({ severity: "critical", key: null, title: `${pl.label} ne reçoit aucun achat`, evidence: `L'achat est signalé à la ${stage(setup.purchaseAt)}, ce qui passe par ${pl.serverName}, et son jeton n'est pas renseigné.`, action: `Ajouter le jeton de ${pl.serverName} dans Paramètres, carte « Pixels publicitaires », ou y signaler l'achat dès que la commande est passée.`, fix: "tracking" });
      } else if (!pl.server) {
        out.push({ severity: "warning", key: null, title: pl.serverTitle, evidence: `${money(pl.spend)} dépensés sur ${pl.label} avec le pixel du navigateur seul : il perd des achats (bloqueurs, iPhone, refus des cookies), l'algorithme apprend sur moins d'acheteurs.`, action: `Ajouter le jeton de ${pl.serverName} dans Paramètres, carte « Pixels publicitaires ».`, fix: "tracking" });
      }
    }
    const anyPixel = (setup.metaPixel && metaSpend > 0) || (setup.tiktokPixel && tiktokSpend > 0);
    const server = (setup.metaPixel && setup.metaCapi) || (setup.tiktokPixel && setup.tiktokEvents);
    const toDeliver = baseline?.daysToDeliver ?? null;
    if (anyPixel && setup.purchaseAt === "placed" && k.confirmRate != null && k.confirmRate < PIXEL_CONFIRM_FLOOR && k.decided >= 20) {
      const quick = toDeliver != null && toDeliver < LATE_DELIVERY_DAYS;
      const delivered = quick && deliveredPerWeek != null && deliveredPerWeek >= LEARNING_EVENTS_PER_WEEK ? ` (ou « quand la commande est livrée et payée » : environ ${count(deliveredPerWeek)} livraisons par semaine suffisent pour apprendre)` : "";
      out.push({
        severity: "warning",
        key: null,
        title: "Le pixel apprend sur des commandes jamais confirmées",
        evidence: `${pct(1 - k.confirmRate)} des commandes appelées ne sont pas confirmées, mais chacune est envoyée comme un achat : l'algorithme cherche des gens qui leur ressemblent.`,
        action: server
          ? `Dans Paramètres, carte « Pixels publicitaires », signaler l'achat « quand la commande est confirmée par téléphone »${delivered}.`
          : "Ajouter le jeton de l'API Conversions, puis signaler l'achat « quand la commande est confirmée par téléphone » (Paramètres, carte « Pixels publicitaires »).",
        fix: "tracking",
      });
    }
    if (anyPixel && setup.purchaseAt === "delivered" && toDeliver != null && toDeliver >= LATE_DELIVERY_DAYS) {
      out.push({
        severity: "warning",
        key: null,
        title: "L'achat arrive trop tard pour les publicités",
        evidence: `Une commande est livrée en moyenne ${dec(toDeliver)} jours après avoir été passée. Meta et TikTok ne relient un achat à une publicité que dans les 7 jours qui suivent le clic : une bonne partie des livraisons n'apprend rien à l'algorithme.`,
        action: "Dans Paramètres, carte « Pixels publicitaires », signaler l'achat quand la commande est confirmée par téléphone : l'algorithme apprend le jour même, sur des commandes vérifiées.",
        fix: "tracking",
      });
    } else if (anyPixel && setup.purchaseAt === "delivered" && deliveredPerWeek != null && deliveredPerWeek < LEARNING_EVENTS_PER_WEEK) {
      out.push({ severity: "info", key: null, title: "Peu d'achats envoyés pour apprendre", evidence: `Environ ${plural(deliveredPerWeek, "livraison", "livraisons")} par semaine : moins que les ${LEARNING_EVENTS_PER_WEEK} dont un ensemble de publicités a besoin pour sortir de l'apprentissage.`, action: "Signaler l'achat à la confirmation (Paramètres, carte « Pixels publicitaires ») : plus d'événements, presque aussi propres.", fix: "tracking" });
    }
    // Purchases sent at confirmation or delivery make the platform's buyer audience clean: a lookalike can start from it.
    const buyers = baseline && baseline.orders > 0 ? baseline.orders * (setup.purchaseAt === "confirmed" ? (baseline.confirmRate ?? 0) : (baseline.netDeliveryRate ?? 0)) : 0;
    if (setup.metaPixel && setup.metaCapi && metaSpend > 0 && setup.purchaseAt !== "placed" && buyers >= LOOKALIKE_MIN_BUYERS) {
      out.push({
        severity: "info",
        key: null,
        title: "Une audience similaire à partir des vrais acheteurs",
        evidence: `Environ ${count(buyers)} commandes ${setup.purchaseAt === "confirmed" ? "confirmées" : "livrées"} sur 180 jours. Comme l'achat est envoyé à Meta à la ${stage(setup.purchaseAt)}, son audience « Achat » ne garde que des acheteurs vérifiés (ceux qui acceptent les cookies publicitaires), sans les faux numéros.`,
        action: "Dans le gestionnaire de publicités Meta : créer une audience personnalisée « Achat » sur 180 jours, puis une audience similaire de 1 à 3 % en Tunisie, et la tester dans un ensemble à part contre le ciblage large. Exclure les acheteurs des 30 derniers jours des campagnes qui cherchent de nouveaux clients.",
      });
    }
  }

  // The platform only hears of the orders that reached the stage it is told about: compare with those.
  const purchases = total.platform.purchases;
  const at = setup?.purchaseAt ?? "placed";
  const real = reportedOrders(total.funnel, at);
  if (purchases != null && k.overReporting != null) {
    if (purchases >= 2 * REPORT_MIN_EVENTS && k.overReporting >= OVER_REPORT_RATIO) {
      out.push({ severity: "warning", key: null, title: "La plateforme compte plus d'achats que la boutique", evidence: `${count(purchases)} achats comptés pour ${plural(real, ...REPORTED_WORDS[at])}${at === "delivered" ? "" : `, dont ${plural(total.funnel.delivered, "livrée", "livrées")}`}.`, action: "Juger uniquement sur les chiffres de la boutique : la plateforme compte aussi des achats après un simple affichage, et des doublons." });
    } else if (real >= 2 * REPORT_MIN_EVENTS && k.overReporting <= UNDER_REPORT_RATIO) {
      out.push({ severity: "warning", key: null, title: "Le pixel ne voit qu'une partie des commandes", evidence: `${plural(purchases, "achat reçu", "achats reçus")} par la plateforme pour ${plural(real, ...REPORTED_WORDS[at])}.`, action: "Ajouter le jeton de l'API Conversions (Meta) ou de l'Events API (TikTok) dans Paramètres, carte « Pixels publicitaires ». Les clients qui refusent les cookies ne sont pas envoyés : une partie de l'écart est normale.", fix: "tracking" });
    }
  }
  if (coverage && coverage.orders >= 20 && spend > 0) {
    const share = coverage.tagged / coverage.orders;
    if (share < UTM_COVERAGE_FLOOR) {
      out.push({ severity: "warning", key: null, title: "Commandes sans source", evidence: `${pct(1 - share)} des ${count(coverage.orders)} commandes récentes n'ont pas de source : les publicités qui les ont amenées ne sont pas créditées.`, action: "Ajouter les UTM à chaque lien de publicité avec le générateur de liens.", fix: "links" });
    }
  }
  return out;
}

/** Budget spread over many rows that never get enough data; `spend` is the account's. */
function fragmentation(rows: AdRow[], advice: RowAdvice[], spend: number): Weighted | null {
  const waiting = rows.map((row, i) => ({ spend: row.platform.spend ?? 0, a: advice[i] })).filter((x) => x.a.verdict === "wait" && x.spend > 0);
  const waitingSpend = waiting.reduce((s, x) => s + x.spend, 0);
  if (waiting.length < FRAGMENTED_ROWS || spend <= 0 || waitingSpend / spend < FRAGMENTED_SHARE) return null;
  const target = waiting.find((x) => x.a.target != null)?.a.target ?? null;
  return {
    weight: waitingSpend,
    insight: {
      severity: "warning",
      key: null,
      title: "Budget trop éparpillé",
      evidence: `${waiting.length} lignes se partagent ${money(waitingSpend)} (${pct(waitingSpend / spend)} de la dépense) sans qu'aucune ait assez de données pour être jugée.`,
      action: `${rows.every((r) => r.level === "ad") ? "Garder 3 à 5 publicités par ensemble et couper les autres" : "Regrouper le budget sur 2 ou 3 campagnes à la fois"}, pour que chacune atteigne ${target != null ? `environ ${money(JUDGE_SPEND_MULTIPLE * target)}` : "assez"} de dépense.`,
    },
  };
}

/** One row carrying most of the delivered orders: the account dies with it. */
function concentration(rows: AdRow[], advice: RowAdvice[]): Weighted | null {
  const delivered = advice.map((a) => a.kpis.projection?.delivered ?? rows.find((r) => r.key === a.key)?.funnel.delivered ?? 0);
  const sum = delivered.reduce((s, d) => s + d, 0);
  if (rows.length < 2 || sum < CONCENTRATION_MIN_DELIVERED) return null;
  const top = delivered.indexOf(Math.max(...delivered));
  const share = delivered[top] / sum;
  if (share < CONCENTRATION_SHARE) return null;
  return {
    weight: rows[top].platform.spend ?? 0,
    insight: {
      severity: "warning",
      key: rows[top].key,
      title: `Tout repose sur ${name(rows[top])}`,
      evidence: `Elle fait environ ${pct(share)} des livraisons du compte${advice[top].kpis.projection?.projected ? " (projection)" : ""}.`,
      action: "Préparer la relève avant qu'elle s'use : 2 à 3 nouvelles créatives par semaine dans un ensemble de test avec 10 à 20 % du budget.",
      fix: "brief",
    },
  };
}

/** Money freed by the losers, against what the winners' next step needs. */
function reallocation(advice: RowAdvice[]): Weighted | null {
  const freedRows = advice.filter((a) => (a.budgetChange ?? 0) < 0 && a.spendPerDay != null);
  const freed = freedRows.reduce((s, a) => s + (a.spendPerDay! * Math.abs(a.budgetChange!)) / 100, 0);
  if (freed <= 0) return null;
  const winners = advice.filter((a) => a.verdict === "scale" && a.spendPerDay != null);
  const needed = winners.reduce((s, a) => s + (a.spendPerDay! * (a.budgetChange ?? 0)) / 100, 0);
  const rest = Math.max(0, freed - needed);
  return {
    weight: freed,
    insight: {
      severity: "info",
      key: null,
      title: "Déplacer le budget",
      evidence: `Couper ou réduire ${plural(freedRows.length, "ligne libère", "lignes libèrent")} environ ${money(Math.round(freed))} par jour.${winners.length ? ` Monter ${winners.length > 1 ? `les ${winners.length} gagnantes` : "la gagnante"} d'un palier demande environ ${money(Math.round(needed))} par jour.` : ""}`,
      action: !winners.length
        ? "Aucune ligne n'est assez sûre pour recevoir plus : garder ce budget pour tester 2 à 3 nouvelles créatives dans un ensemble de test."
        : freed >= needed
          ? `Faire les deux le même jour${rest > 0 ? `, et garder le reste (environ ${money(Math.round(rest))} par jour) pour tester 2 à 3 nouvelles créatives` : ""}.`
          : "Mettre d'abord ce budget sur la gagnante la moins chère par livrée, puis monter les autres si le budget total le permet.",
      fix: winners.length ? undefined : "brief",
    },
  };
}

type Line = { row: AdRow; a: RowAdvice };

/**
 * What the account should do first when it is not clearly profitable, from
 * what its lines are: cut the lines marked "cut" (named), else repair the
 * lines whose measure is broken, else fix the lines marked "fix", else the
 * account's weakest stage, else wait for the open orders or for the lines to
 * have enough data, else new creatives.
 */
function accountStep(lines: Line[], neck: Bottleneck | null, k: Kpis, losing: boolean): { action: string; fix?: Fix } {
  const marked = (v: Advice["verdict"]) => lines.filter((l) => l.a.verdict === v).sort((x, y) => (y.row.platform.spend ?? 0) - (x.row.platform.spend ?? 0));
  const cut = marked("cut");
  const broken = marked("tracking");
  const fix = marked("fix");
  if (cut.length) {
    return { action: losing ? `Couper ${names(cut.map((l) => l.row))} et garder seulement les lignes sous le coût max.` : `Couper ${names(cut.map((l) => l.row))} avant de monter quoi que ce soit.` };
  }
  if (broken.length) {
    const n = broken.length;
    return { action: `Réparer d'abord le lien de ${names(broken.map((l) => l.row))} : ${pluralWord(n, "sa dépense ne retrouve pas ses visites", "leurs dépenses ne retrouvent pas leurs visites")}, rien ne peut être jugé.`, fix: "links" };
  }
  if (fix.length) {
    const first = fix[0];
    const stage = first.a.bottleneck;
    return {
      action: `Corriger ${names(fix.map((l) => l.row))} avant de monter quoi que ce soit${stage ? ` (pour ${name(first.row)} : ${lowerFirst(stage.title)})` : ""}.`,
      fix: stage ? STAGE_TEXT[stage.stage].fix : "brief",
    };
  }
  if (neck) return { action: `Corriger le point faible du compte, ${lowerFirst(neck.title)} : ${lowerFirst(neck.action)}`, fix: STAGE_TEXT[neck.stage].fix };
  if ((k.openShare ?? 0) > YOUNG_OPEN_SHARE) return { action: `Attendre la fin des appels et des livraisons en cours (${pct(k.openShare)} des commandes) avant de toucher aux budgets.` };
  if (lines.length > 0 && 2 * marked("wait").length >= lines.length) {
    return { action: losing ? "Réduire les budgets et les regrouper sur 2 ou 3 lignes : aucune n'a encore assez de données pour être jugée seule." : "Attendre que les lignes aient assez de données pour être jugées, sans monter de budget." };
  }
  return {
    action: losing ? "Réduire les lignes les plus chères par livrée et tester 2 à 3 nouvelles créatives, ou une offre (pack) qui augmente la marge." : "Garder les budgets et tester 2 à 3 nouvelles créatives, ou une offre (pack) qui augmente la marge.",
    fix: "brief",
  };
}

/**
 * The sentence about the whole account, read off the account's own verdict
 * so the two never disagree: profitable when the verdict is "scale", or
 * "keep" with the cost very likely under the max; losing when it is "cut" or
 * "fix" with the cost very likely over it, or when a delivered order loses
 * money before any ad; close to (or over) the max otherwise. Null while the
 * account cannot be judged. The action names the lines that make it so.
 */
function accountHeadline(lines: Line[], a: RowAdvice, neck: Bottleneck | null, spend: number): Insight | null {
  const k = a.kpis;
  if (a.verdict === "fix" && k.marginPerDelivered != null && k.marginPerDelivered <= 0) {
    return { severity: "critical", key: null, title: "Le compte perd de l'argent avant la publicité", evidence: a.decision ?? a.reasons[0], action: "Voir l'onglet Seuils pour le prix, le pack ou le coût fournisseur qui redonne de la marge, avant de dépenser plus.", fix: "productCost" };
  }
  const p = a.probProfitable;
  if (p == null || a.target == null || !(a.verdict === "scale" || a.verdict === "keep" || a.verdict === "fix" || a.verdict === "cut")) return null;
  const proj = k.projection;
  const projected = proj?.projected ? " projeté" : "";
  const contribution = proj?.contribution ?? k.contribution;
  const cost = a.judgedCpd != null ? `Coût par livrée${projected} ${money(a.judgedCpd)} pour un maximum de ${money(a.target)}` : `Aucune livrée pour ${money(spend)} dépensés, pour un maximum de ${money(a.target)} par livrée`;
  const evidence = `${cost}${contribution != null ? ` ; résultat après pub${projected} ${money(contribution)}` : ""}.`;
  const cut = lines.filter((l) => l.a.verdict === "cut").map((l) => l.row);
  if (a.verdict === "scale" || (a.verdict === "keep" && p >= WIN_PROB)) {
    const winners = lines.filter((l) => l.a.verdict === "scale").map((l) => l.row);
    const alsoCut = cut.length ? ` ; couper ${names(cut)}` : "";
    const adLevel = lines.length > 0 && lines.every((l) => l.row.level === "ad");
    const action =
      a.verdict === "keep"
        ? `Garder les budgets${alsoCut}.`
        : adLevel
          ? `Garder ${names(winners)} et couper les perdantes de ${pluralWord(winners.length, "son", "leur")} ensemble, puis monter le budget de l'ensemble par paliers de 20 %, tous les 3 jours${alsoCut}.`
          : `Monter seulement ${names(winners)}, par paliers de 20 à 30 % tous les 3 jours, et garder les autres budgets${alsoCut}.`;
    return { severity: "good", key: null, title: "Le compte est rentable", evidence: a.verdict === "keep" && a.decision ? `${evidence} ${a.decision}` : evidence, action };
  }
  if (p <= LOSE_PROB) return { severity: "critical", key: null, title: "Le compte perd de l'argent", evidence, ...accountStep(lines, neck, k, true) };
  const over = a.judgedCpd == null || a.judgedCpd > NEAR_MAX_SHARE * a.target;
  return { severity: over ? "warning" : "info", key: null, title: over ? "Le compte est au-dessus du coût max" : "Le compte est proche du coût max", evidence, ...accountStep(lines, neck, k, false) };
}

/**
 * Orders still waiting for their call long after they were placed: they end
 * delivered far less often. Counted over the rows that carry the figure (all
 * of them when the data layer gives it).
 */
function staleInsight(rows: AdRow[], k: Kpis, baseline: Baseline | null): Insight | null {
  const stale = rows.reduce((s, r) => s + (r.funnel.pendingStale ?? 0), 0);
  if (stale < STALE_MIN_ORDERS) return null;
  const top = rows.filter((r) => (r.funnel.pendingStale ?? 0) > 0).sort((a, b) => (b.funnel.pendingStale ?? 0) - (a.funnel.pendingStale ?? 0));
  const where =
    rows.length < 2 || top.length === 0
      ? ""
      : top.length === 1
        ? `, ${pluralWord(stale, "pour", "toutes pour")} ${name(top[0])}`
        : `, dont ${joinFr(top.slice(0, 3).map((r) => `${count(r.funnel.pendingStale ?? 0)} pour ${name(r)}`))}`;
  const rate = baseline?.staleDeliveredRate ?? null;
  const usual = baseline?.netDeliveryRate ?? null;
  const odds = rate != null ? ` Dans la boutique, ${pct(rate)} des commandes restées sans appel aussi longtemps finissent livrées${usual != null ? `, contre ${pct(usual)} de toutes les commandes` : ""}.` : "";
  return {
    severity: "warning",
    key: null,
    title: `${plural(stale, "commande attend", "commandes attendent")} un appel depuis plus de ${STALE_PENDING_HOURS} h`,
    evidence: `${plural(stale, "commande", "commandes")} sur ${count(Math.max(stale, k.pending))} en attente d'appel ${pluralWord(stale, "a", "ont")} été ${pluralWord(stale, "passée", "passées")} il y a plus de ${STALE_PENDING_HOURS} h${where}.${odds}`,
    action: "Les appeler aujourd'hui, les plus anciennes d'abord, et annuler celles qui restent injoignables : les chiffres cessent alors de les compter comme en cours.",
    fix: "orders",
  };
}

/** Orders confirmed by phone, then cancelled before shipping: counted apart from the cancellations at the call. */
function lateCancelInsight(k: Kpis, purchaseAt?: TrackingSetup["purchaseAt"]): Insight | null {
  const n = k.lateCancelled;
  if (n < LATE_CANCEL_MIN_ORDERS || k.lateCancelRate == null || k.lateCancelRate < LATE_CANCEL_SHARE) return null;
  return {
    severity: "warning",
    key: null,
    title: "Des commandes annulées après confirmation",
    evidence: `${plural(n, "commande confirmée", "commandes confirmées")} au téléphone ${pluralWord(n, "a", "ont")} été ${pluralWord(n, "annulée", "annulées")} avant l'envoi : ${pct(k.lateCancelRate)} des confirmées.${purchaseAt === "confirmed" ? " L'achat étant signalé à la confirmation, les publicités les ont comptées comme des ventes." : ""}`,
    action: "Préparer et expédier le jour même de la confirmation, et demander au client pourquoi il annule : un délai trop long ou un prix mal compris se corrigent.",
  };
}

// ── Audience segments ──────────────────────────────────────────────────

/**
 * Rates of each segment with Wilson intervals, and whether it is
 * significantly worse or better than the rest of the table: probability over
 * 1 − 0.1 / (segments tested), so a table of 24 governorates does not raise
 * false alarms by chance, and a gap of at least 8 points. Confirmation is
 * read over the orders already called when `pending` is given.
 */
export function readSegments(rows: SegmentRow[]): SegmentRead[] {
  const called = (r: SegmentRow) => Math.max(0, r.orders - (r.pending ?? 0));
  const tot = sumSegments(rows);
  const totCalled = rows.reduce((s, r) => s + called(r), 0);
  const testedConfirm = rows.filter((r) => called(r) >= SEGMENT_MIN_ORDERS && totCalled - called(r) > 0).length;
  const testedDelivery = rows.filter((r) => r.delivered + r.back >= SEGMENT_MIN_PARCELS && tot.delivered + tot.back - r.delivered - r.back > 0).length;
  const flag = (seg: Count, rest: Count, tested: number, min: number): { prob: number | null; flag: SegmentFlag } => {
    if (seg.n < min || rest.n <= 0) return { prob: null, flag: null };
    const prob = probBeats(rest, seg);
    if (prob == null) return { prob: null, flag: null };
    const need = 1 - SEGMENT_FALSE_ALARM / Math.max(1, tested);
    const gap = seg.successes / seg.n - rest.successes / rest.n;
    return { prob, flag: prob >= need && gap <= -SEGMENT_MIN_GAP ? "worse" : 1 - prob >= need && gap >= SEGMENT_MIN_GAP ? "better" : null };
  };
  return rows.map((r) => {
    const parcels = r.delivered + r.back;
    const n = called(r);
    const c = flag({ successes: r.confirmed, n }, { successes: tot.confirmed - r.confirmed, n: totCalled - n }, testedConfirm, SEGMENT_MIN_ORDERS);
    const d = flag({ successes: r.delivered, n: parcels }, { successes: tot.delivered - r.delivered, n: tot.delivered + tot.back - parcels }, testedDelivery, SEGMENT_MIN_PARCELS);
    return {
      ...r,
      confirmRate: n > 0 ? Math.min(1, r.confirmed / n) : null,
      confirmCi: wilson(r.confirmed, n),
      deliveryRate: parcels > 0 ? r.delivered / parcels : null,
      deliveryCi: wilson(r.delivered, parcels),
      refusalRate: parcels > 0 ? r.back / parcels : null,
      confirmProbWorse: c.prob,
      deliveryProbWorse: d.prob,
      confirmFlag: c.flag,
      deliveryFlag: d.flag,
    };
  });
}

function sumSegments(rows: SegmentRow[]): Required<Omit<SegmentRow, "label">> {
  return rows.reduce(
    (t, r) => ({ orders: t.orders + r.orders, confirmed: t.confirmed + r.confirmed, delivered: t.delivered + r.delivered, back: t.back + r.back, pending: t.pending + (r.pending ?? 0) }),
    { orders: 0, confirmed: 0, delivered: 0, back: 0, pending: 0 },
  );
}

/** Hours of the day (labels "0" to "23", or "9 h") grouped into blocks: one hour rarely has enough orders on its own. Other labels: unchanged. */
export function hourBlocks(rows: SegmentRow[], size = 4): SegmentRow[] {
  const hours = rows.map((r) => Number.parseInt(r.label, 10));
  if (hours.some((h) => !Number.isInteger(h) || h < 0 || h > 23)) return rows;
  const groups = new Map<number, SegmentRow[]>();
  rows.forEach((r, i) => {
    const start = Math.floor(hours[i] / size) * size;
    groups.set(start, [...(groups.get(start) ?? []), r]);
  });
  const withPending = rows.every((r) => r.pending != null);
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, rs]) => {
      const t = sumSegments(rs);
      const block: SegmentRow = { label: `${start} h – ${Math.min(24, start + size)} h`, orders: t.orders, confirmed: t.confirmed, delivered: t.delivered, back: t.back };
      return withPending ? { ...block, pending: t.pending } : block;
    });
}

const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const DEVICES: Record<string, string> = { mobile: "un téléphone", desktop: "un ordinateur", tablet: "une tablette", inconnu: "un appareil inconnu" };

const SEGMENT_TEXT: Record<SegmentKind, { who: (l: string) => string; confirm: string; delivery: string; better: string | null }> = {
  governorate: {
    who: (l) => l,
    confirm: "Appeler ces commandes en premier ; si l'écart reste deux semaines, réduire ce gouvernorat dans le ciblage.",
    // A governorate that refuses more can still pay: excluding it is right only once its delivery rate is under the product's floor.
    delivery: "Reconfirmer la veille de la livraison dans ce gouvernorat et vérifier le délai du transporteur. Si l'écart reste deux semaines et que sa livraison passe sous la « livraison minimale » de l'onglet Seuils, l'exclure des audiences.",
    better: "Tester un ensemble de publicités ciblé sur ce gouvernorat avec 10 à 20 % du budget.",
  },
  device: {
    who: (l) => `Les commandes depuis ${DEVICES[l.toLowerCase()] ?? l}`,
    confirm: "Séparer cet appareil dans un ensemble de publicités à part pour en contrôler le budget, et appeler ces commandes plus vite.",
    delivery: "Séparer cet appareil dans un ensemble de publicités à part pour en contrôler le budget ; reconfirmer ces commandes avant l'envoi.",
    better: null,
  },
  hour: {
    who: (l) => `Les commandes de ${l.replace(" – ", " à ")}`,
    confirm: "Appeler ces commandes en premier le matin ; si l'écart reste, réduire la diffusion à ces heures (programmation horaire : sur Meta, elle demande un budget total de campagne).",
    delivery: "Reconfirmer ces commandes avant l'envoi ; si l'écart reste, réduire la diffusion à ces heures (programmation horaire).",
    better: null,
  },
  weekday: {
    // ISO weekday numbers ("1" is Monday) or a name.
    who: (l) => `Les commandes du ${/^[1-7]$/.test(l) ? WEEKDAYS[Number(l) - 1] : l.toLowerCase()}`,
    confirm: "Appeler plus vite les commandes de ce jour-là ; si l'écart reste, baisser le budget ce jour-là.",
    delivery: "Reconfirmer les commandes de ce jour-là avant l'envoi ; si l'écart reste, baisser le budget ce jour-là.",
    better: null,
  },
};

/** What the audience table says, at most 3 insights per table: the worst segments by volume, then the best governorate. */
export function segmentInsights(kind: SegmentKind, rows: SegmentRow[]): Insight[] {
  const read = readSegments(kind === "hour" ? hourBlocks(rows) : rows);
  const tot = sumSegments(read);
  const called = (r: SegmentRow) => Math.max(0, r.orders - (r.pending ?? 0));
  const totCalled = tot.orders - tot.pending;
  const text = SEGMENT_TEXT[kind];
  const found: { insight: Insight; weight: number }[] = [];
  for (const r of read) {
    const restParcels = tot.delivered + tot.back - r.delivered - r.back;
    const parcels = r.delivered + r.back;
    const refused = r.deliveryFlag === "worse" && r.refusalRate != null ? `Refus ${pct(r.refusalRate)} sur ${count(parcels)} colis, contre ${pct((tot.back - r.back) / restParcels)} ailleurs.` : null;
    const unconfirmed =
      r.confirmFlag === "worse" && r.confirmRate != null
        ? `Confirmation ${pct(r.confirmRate)} sur ${plural(called(r), "commande appelée", "commandes appelées")}, contre ${pct((tot.confirmed - r.confirmed) / (totCalled - called(r)))} ailleurs.`
        : null;
    if (!refused && !unconfirmed) continue;
    // One insight per segment. A refused parcel costs the carrier both ways, an unconfirmed order only a call: refusals lead.
    const title = refused && unconfirmed ? "moins de confirmations et plus de refus" : refused ? "plus de refus" : "moins de confirmations";
    found.push({
      weight: r.orders,
      insight: { severity: "warning", key: null, title: `${text.who(r.label)} : ${title}`, evidence: [unconfirmed, refused].filter(Boolean).join(" "), action: refused ? text.delivery : text.confirm },
    });
  }
  found.sort((a, b) => b.weight - a.weight);
  const out = found.slice(0, SEGMENT_MAX_INSIGHTS).map((x) => x.insight);
  if (text.better && out.length < SEGMENT_MAX_INSIGHTS) {
    const best = read.filter((r) => r.deliveryFlag === "better" || r.confirmFlag === "better").sort((a, b) => b.orders - a.orders)[0];
    if (best) {
      const what = best.deliveryFlag === "better" ? `Livraison ${pct(best.deliveryRate)} sur ${count(best.delivered + best.back)} colis` : `Confirmation ${pct(best.confirmRate)} sur ${plural(called(best), "commande appelée", "commandes appelées")}`;
      out.push({ severity: "good", key: null, title: `${text.who(best.label)} : de meilleurs clients`, evidence: `${what}, nettement au-dessus du reste.`, action: text.better });
    }
  }
  return out;
}

/**
 * Whether calling late costs confirmations: orders called within the hour
 * against those called after more than 4 hours, with the segments' test (each
 * side with enough orders, a gap of at least 8 points, one comparison within
 * the false-alarm budget). Null when the data is thin or the gap not clear.
 */
export function callDelayInsight(rows: CallDelayRow[]): Insight | null {
  const group = (buckets: CallDelayRow["bucket"][]): Count =>
    rows.filter((r) => buckets.includes(r.bucket)).reduce((c, r) => ({ successes: c.successes + Math.min(r.confirmed, r.orders), n: c.n + r.orders }), { successes: 0, n: 0 });
  const fast = group(CALL_FAST);
  const slow = group(CALL_SLOW);
  if (fast.n < SEGMENT_MIN_ORDERS || slow.n < SEGMENT_MIN_ORDERS) return null;
  const fastRate = fast.successes / fast.n;
  const slowRate = slow.successes / slow.n;
  const prob = probBeats(fast, slow);
  if (prob == null || prob < 1 - SEGMENT_FALSE_ALARM || fastRate - slowRate < SEGMENT_MIN_GAP) return null;
  return {
    severity: "warning",
    key: null,
    title: "Les commandes appelées tard se confirment moins",
    evidence: `Confirmation ${pct(fastRate)} sur ${plural(fast.n, "commande appelée", "commandes appelées")} en moins d'1 h, contre ${pct(slowRate)} sur ${plural(slow.n, "commande appelée", "commandes appelées")} après plus de 4 h. Une partie de l'écart peut venir des commandes de nuit, appelées le lendemain.`,
    action: "Appeler dans l'heure qui suit chaque commande.",
    fix: "orders",
  };
}

// ── Ads compared ───────────────────────────────────────────────────────

/**
 * Ads side by side on one metric: the value, a 90 % interval for the cost
 * (95 % Wilson for rates), and the probability that each is the best.
 * "cost" is the cost per delivered order with the projection, the one that
 * decides; the rates say why.
 */
export function compareAds(rows: AdRow[], metric: AdMetric, costs: Costs, baseline: Baseline | null): AdComparison[] {
  const label = (r: AdRow) => r.ad ?? r.campaign ?? r.source;
  if (metric === "cost") {
    const events = rows.map((r) => kpis(r, costs, baseline).projection?.delivered ?? r.funnel.delivered);
    const probs = probBestCost(rows.map((r, i) => ({ events: events[i], spend: r.platform.spend })));
    return rows.map((r, i) => {
      const iv = costInterval(events[i], r.platform.spend);
      const spend = r.platform.spend;
      return { key: r.key, label: label(r), value: spend != null && events[i] > 0 ? Math.round(spend / events[i]) : null, low: iv?.low ?? null, high: iv?.high ?? null, n: events[i], probBest: probs[i], enough: spend != null && events[i] >= AD_MIN.cost };
    });
  }
  const counts: (Count | null)[] = rows.map((r) => {
    const f = r.funnel;
    if (metric === "orderRate") return { successes: f.orders, n: f.sessions };
    if (metric === "ctr") return r.platform.impressions != null && r.platform.clicks != null ? { successes: r.platform.clicks, n: r.platform.impressions } : null;
    if (metric === "confirmRate") return { successes: f.confirmed, n: Math.max(0, f.orders - pendingOf(f)) };
    return { successes: f.delivered, n: f.delivered + f.back };
  });
  const probs = probBestRate(counts.map((c) => c ?? { successes: 0, n: 0 }));
  return rows.map((r, i) => {
    const c = counts[i];
    const iv = c ? wilson(c.successes, c.n) : null;
    return { key: r.key, label: label(r), value: iv?.rate ?? null, low: iv?.low ?? null, high: iv?.high ?? null, n: c?.n ?? 0, probBest: probs[i], enough: c != null && c.n >= AD_MIN[metric] };
  });
}

/** Winner, not enough data per ad, and what to test next. */
export function creativeInsights(rows: AdRow[], costs: Costs, baseline: Baseline | null): Insight[] {
  const out: Insight[] = [];
  if (rows.length < 2) return out;
  const cost = compareAds(rows, "cost", costs, baseline);
  const ready = cost.filter((c) => c.enough);
  const spend = rows.reduce((s, r) => s + (r.platform.spend ?? 0), 0);
  if (ready.length === 0) {
    if (spend > 0) out.push({ severity: "info", key: null, title: "Pas assez de données par publicité", evidence: `${rows.length} publicités se partagent ${money(spend)} ; aucune n'a encore ${AD_MIN.cost} livrées.`, action: "Garder 3 à 5 publicités par ensemble, pas plus, pour que chacune reçoive assez de budget pour être jugée." });
    return out;
  }
  const best = [...cost].sort((a, b) => (b.probBest ?? 0) - (a.probBest ?? 0))[0];
  if (best.enough && (best.probBest ?? 0) >= AD_WINNER_PROB) {
    const range = best.low != null ? ` (entre ${money(best.low)} et ${best.high != null ? money(best.high) : "plus"})` : "";
    out.push({
      severity: "good",
      key: best.key,
      title: `« ${best.label} » est la meilleure publicité`,
      evidence: `Probabilité d'être la moins chère par livrée : ${chance(best.probBest ?? 0)} ; coût par livrée ${money(best.value)}${range}.`,
      action: "La garder, et couper les publicités marquées « couper » dans son ensemble pour qu'elle prenne leur budget. Tester 3 variantes de son accroche : mêmes images, nouvelles 3 premières secondes.",
      fix: "brief",
    });
  } else if (ready.length >= 2) {
    out.push({ severity: "info", key: null, title: "Pas encore de gagnante nette", evidence: `La meilleure publicité n'a que ${chance(best.probBest ?? 0)} de chances d'être la moins chère par livrée.`, action: "Laisser tourner sans toucher aux budgets et couper seulement les publicités marquées « couper » ; une gagnante se déclare quand l'une dépasse 90 %." });
  }
  return out;
}

// ── Everything ─────────────────────────────────────────────────────────

/**
 * The whole report for one level of rows: each row's advice, the account's,
 * and every insight sorted by severity then by the money involved. Pass the
 * campaigns (or the ads) of a period, with that period's length in days.
 */
export function advise(input: AdviseInput): Report {
  const { rows, costs, baseline, days } = input;
  const purchaseAt = input.tracking?.purchaseAt;
  const total = totalRow(rows);
  const kTotal = kpis(total, costs, baseline, { purchaseAt });
  // A row with no delivered order yet is judged on the account's own margin when the shop's is not known.
  const opts: KpiOptions = { purchaseAt, accountMargin: kTotal.marginPerDelivered };
  const accountDelivered = kTotal.projection?.delivered ?? total.funnel.delivered;
  const accountCpd = total.platform.spend != null && accountDelivered > 0 ? Math.round(total.platform.spend / accountDelivered) : null;

  // Like for like: the same platform for its own stages, the same campaign for an ad.
  const family = (r: AdRow) => {
    const src = r.source.toLowerCase();
    return META_SOURCES.has(src) ? "Meta" : TIKTOK_SOURCES.has(src) ? "TikTok" : src;
  };
  const groupOf = (keyOf: (r: AdRow) => string) => {
    const lists = new Map<string, AdRow[]>();
    for (const r of rows) lists.set(keyOf(r), [...(lists.get(keyOf(r)) ?? []), r]);
    return new Map([...lists].map(([key, rs]) => [key, { total: totalRow(rs), size: rs.length }]));
  };
  const byFamily = groupOf(family);
  const byCampaign = groupOf((r) => `${r.source}|${r.campaign ?? ""}`);
  const peersOf = (row: AdRow): Peers => {
    const fam = byFamily.get(family(row))!;
    const camp = byCampaign.get(`${row.source}|${row.campaign ?? ""}`)!;
    const name = family(row);
    return {
      platform: fam.size > 1 ? subtract(fam.total, row) : null,
      platformWho: name === "Meta" || name === "TikTok" ? `le reste du compte ${name}` : `les autres lignes « ${name} »`,
      campaign: row.level === "ad" && row.campaign != null && camp.size > 1 ? subtract(camp.total, row) : null,
    };
  };

  const advice = rows.map((row) => {
    const k = kpis(row, costs, baseline, opts);
    const ref = reference(rows.length > 1 ? subtract(total, row) : null, baseline, rows.length > 1 ? peersOf(row) : {});
    return adviseRow(row, k, { ref, days, accountCpd: rows.length > 1 ? accountCpd : null, daily: input.daily?.[row.key] });
  });
  const totalRef = reference(null, baseline);
  const totalAdvice = adviseRow(total, kTotal, { ref: totalRef, days, account: { anyScale: advice.some((a) => a.verdict === "scale") } });
  const totalNeck = bottleneck(total, totalRef);
  const lines: Line[] = rows.map((row, i) => ({ row, a: advice[i] }));
  // The account's spend as the overview's tile counts it: the source rows when given (spend typed without a campaign included).
  const accountSpend = input.sources ? (totalRow(input.sources).platform.spend ?? 0) : (total.platform.spend ?? 0);

  const weighted: Weighted[] = [];
  const spendOf = (key: string | null) => (key == null ? accountSpend : (rows.find((r) => r.key === key)?.platform.spend ?? 0));
  const push = (xs: Insight[]) => xs.forEach((insight) => weighted.push({ insight, weight: spendOf(insight.key) }));

  // The account's money, first: the verdict on the rows judged, in the account's own words.
  const spend = total.platform.spend;
  const headline = spend != null && spend > 0 ? accountHeadline(lines, totalAdvice, totalNeck, spend) : null;
  if (headline) weighted.push({ weight: spend ?? 0, insight: headline });
  // Placed orders lie.
  const net = kTotal.projection?.netDeliveryRate ?? null;
  if (spend != null && spend > 0 && net != null && net < PLACED_LIE_RATE && total.funnel.orders >= 20 && kTotal.cpaPlaced != null && totalAdvice.judgedCpd != null) {
    weighted.push({
      weight: spend * 0.5,
      insight: {
        severity: "info",
        key: null,
        title: "Les commandes passées embellissent les résultats",
        evidence: `Sur ${count(total.funnel.orders)} commandes, environ ${pct(net)} ${kTotal.projection?.projected ? "devraient finir livrées (projection)" : "finissent livrées"} : un CPA de ${money(kTotal.cpaPlaced)} devient ${money(totalAdvice.judgedCpd)} par client livré.`,
        action: "Juger les publicités sur le coût par livrée de cette page, pas sur le coût par achat du gestionnaire de publicités.",
      },
    });
  }
  if (kTotal.projection?.projected && (kTotal.openShare ?? 0) > YOUNG_OPEN_SHARE) {
    weighted.push({ weight: 0, insight: { severity: "info", key: null, title: "Beaucoup de commandes en cours", evidence: kTotal.projection.note, action: "Revenir dans quelques jours pour les chiffres réels ; ne pas couper une ligne sur ses seules commandes en attente." } });
  }
  weighted.push(...missingInsights(rows, total, kTotal, costs, accountSpend, input.sources));
  push(trackingInsights(input.sources ?? rows, total, kTotal, input.tracking, input.coverage, days, baseline));
  for (const insight of [staleInsight(rows, kTotal, baseline), lateCancelInsight(kTotal, purchaseAt), input.callDelay ? callDelayInsight(input.callDelay) : null]) {
    if (insight) weighted.push({ weight: (spend ?? 0) * 0.4, insight });
  }
  rows.forEach((row, i) => push(rowInsights(row, advice[i], purchaseAt)));
  if (totalNeck) weighted.push({ weight: (spend ?? 0) * 0.8, insight: { severity: "warning", key: null, title: `Point faible du compte : ${lowerFirst(totalNeck.title)}`, evidence: totalNeck.evidence, action: totalNeck.action, fix: STAGE_TEXT[totalNeck.stage].fix } });
  if (baseline?.aov != null && kTotal.aov != null && total.funnel.orders - total.funnel.cancelled >= AOV_MIN_ORDERS && kTotal.aov < AOV_LOW_SHARE * baseline.aov) {
    weighted.push({ weight: (spend ?? 0) * 0.3, insight: { severity: "info", key: null, title: "Panier plus petit que d'habitude", evidence: `Panier moyen ${money(kTotal.aov)} contre ${money(baseline.aov)} pour la boutique.`, action: "Mettre en avant un pack de 2 ou 3 avec une remise, ou la livraison offerte dès 2 articles." } });
  }
  // Budgets are not moved from ad to ad by hand: the platform shares an ad set's budget among its ads.
  const adLevel = rows.length > 0 && rows.every((r) => r.level === "ad");
  for (const w of [fragmentation(rows, advice, accountSpend), concentration(rows, advice), adLevel ? null : reallocation(advice)]) if (w) weighted.push(w);
  // Ads are compared inside their campaign (same product, same audience); the per-campaign notes without a row
  // ("not enough data", "no clear winner") belong to the Créatives tab, which reads each campaign on its own.
  if (adLevel) {
    const byCampaignRows = new Map<string, AdRow[]>();
    for (const r of rows) byCampaignRows.set(`${r.source}|${r.campaign ?? ""}`, [...(byCampaignRows.get(`${r.source}|${r.campaign ?? ""}`) ?? []), r]);
    for (const group of byCampaignRows.values()) push(creativeInsights(group, costs, baseline).filter((i) => i.key != null));
  }
  for (const kind of ["governorate", "device", "hour", "weekday"] as SegmentKind[]) {
    const seg = input.segments?.[kind];
    if (seg?.length) segmentInsights(kind, seg).forEach((insight) => weighted.push({ insight, weight: (spend ?? 0) * 0.2 }));
  }

  const insights = weighted
    .map((w, i) => ({ ...w, i }))
    .sort((a, b) => SEVERITY_RANK[a.insight.severity] - SEVERITY_RANK[b.insight.severity] || b.weight - a.weight || a.i - b.i)
    .map((w) => w.insight);

  return {
    rows: advice,
    total: { row: total, advice: totalAdvice, bottleneck: totalNeck },
    insights,
    ads: rows.length > 0 && rows.every((r) => r.level === "ad") ? compareAds(rows, "cost", costs, baseline) : null,
  };
}
