import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BIG_SCALE_STEP, CUT_STEP, FIX_STEP, LOSE_PROB, MIN_SCALE_DAYS, SCALE_STEP, TREND_RECENT_DAYS, WIN_PROB,
  advise, callDelayInsight, compareAds, costTrend, creativeInsights, fatigue, hourBlocks, readSegments, segmentInsights,
  type AdviseInput, type Report, type SegmentRow, type TrackingSetup,
} from "./advisor";
import type { AdRow, Baseline, CallDelayRow, Costs, DayPoint, Insight, Level } from "./types";

// A 59,900 DT lamp + 8 DT delivery = 67,900 DT a delivered order, bought 20 DT. Carrier 7 DT a parcel, 3 DT for one back.
const PRICE = 67_900;
const COST = 20_000;
const costs: Costs = { carrierPerParcel: 7_000, returnPerParcel: 3_000 };
const baseline: Baseline = { orders: 900, confirmRate: 0.72, deliveryRate: 0.8, netDeliveryRate: 0.55, aov: 70_000, daysToDeliver: 3, marginPerDelivered: 35_000 };
const pixels: TrackingSetup = { metaPixel: true, tiktokPixel: false, metaCapi: true, tiktokEvents: false, purchaseAt: "confirmed" };

type Spec = {
  spend: number | null;
  cancelled?: number;
  delivered?: number;
  back?: number;
  open?: number;
  pending?: number;
  sessions?: number;
  productViews?: number;
  formStarts?: number;
  impressions?: number;
  clicks?: number;
  reach?: number;
  purchases?: number;
  unitCost?: number;
  source?: string;
  level?: Level;
};

/** A row whose numbers add up: orders = cancelled + delivered + back + open, confirmed = all but cancelled and pending. */
function line(name: string, s: Spec): AdRow {
  const cancelled = s.cancelled ?? 0;
  const delivered = s.delivered ?? 0;
  const back = s.back ?? 0;
  const open = s.open ?? 0;
  const pending = s.pending ?? 0;
  const orders = cancelled + delivered + back + open;
  const sessions = s.sessions ?? orders * 40;
  const productViews = s.productViews ?? Math.round(sessions * 0.95);
  const formStarts = s.formStarts ?? Math.max(orders, Math.round(productViews * 0.12));
  const source = s.source ?? "facebook";
  const level = s.level ?? "campaign";
  return {
    level,
    key: level === "ad" ? `${source}|lampe|${name}` : `${source}|${name}`,
    source,
    campaign: level === "ad" ? "lampe" : name,
    ad: level === "ad" ? name : null,
    funnel: {
      sessions, visitors: Math.round(sessions * 0.9), productViews, formStarts, orders,
      confirmed: delivered + back + open - pending, cancelled, shipped: delivered + back + open - pending, delivered, back, open, pending,
      revenuePlaced: (orders - cancelled) * PRICE, revenueDelivered: delivered * PRICE, productCostDelivered: delivered * (s.unitCost ?? COST), costUnknownDelivered: 0,
      units: orders - cancelled, multiUnitOrders: 0, newCustomers: orders,
    },
    platform: { spend: s.spend, impressions: s.impressions ?? null, clicks: s.clicks ?? null, reach: s.reach ?? null, purchases: s.purchases ?? null },
  };
}

const totalOf = (rows: AdRow[]) => advise({ rows, costs, baseline, days: 14 }).total.row;
const run = (rows: AdRow[], extra: Partial<AdviseInput> = {}) => advise({ rows, costs, baseline, days: 14, tracking: pixels, ...extra });
const adviceOf = (rows: AdRow[], key: string, extra: Partial<AdviseInput> = {}) => run(rows, extra).rows.find((a) => a.key === key)!;
const titles = (xs: Insight[]) => xs.map((i) => i.title);

const winner = line("lampe-oct", { spend: 300_000, cancelled: 10, delivered: 32, back: 6, open: 2 });
const youngWinner = line("nouvelle", { spend: 60_000, cancelled: 2, open: 18, pending: 10, sessions: 700 });

test("a clear winner is scaled by +30 %, never doubled", () => {
  const a = adviceOf([winner], winner.key);
  assert.equal(a.verdict, "scale");
  assert.equal(a.confidence, "high");
  assert.equal(a.budgetChange, BIG_SCALE_STEP);
  assert.ok(a.judgedCpd! < 0.6 * a.target!);
  assert.ok(a.probProfitable! > 0.99);
  assert.equal(a.targetBasis, "margin");
  assert.ok(a.reasons.some((r) => r.includes("pas plus")));
});

test("a young campaign is read through its projection: small step, medium confidence, said so", () => {
  const a = adviceOf([youngWinner], youngWinner.key);
  assert.equal(a.kpis.projection?.projected, true);
  assert.equal(a.verdict, "scale");
  assert.equal(a.budgetChange, SCALE_STEP);
  assert.notEqual(a.confidence, "high");
  assert.ok(a.reasons.some((r) => r.includes("projeté")));
  assert.ok(a.reasons.some((r) => r.includes("encore en cours")));
  const r = run([youngWinner]);
  assert.ok(titles(r.insights).includes("Beaucoup de commandes en cours"));
});

test("no verdict before the evidence: wait, and say how much more to spend", () => {
  const small = line("test-1", { spend: 30_000, delivered: 1, open: 2 });
  const a = adviceOf([small], small.key);
  assert.equal(a.verdict, "wait");
  assert.equal(a.budgetChange, 0);
  assert.equal(a.confidence, "low");
  assert.equal(a.moreSpend, Math.round(2 * a.target! - 30_000));
  assert.ok(a.reasons.some((r) => r.startsWith("Pas encore assez de données")));
});

test("no order after twice the max cost: cut; before that: wait, with the spend at which to cut", () => {
  const dead = line("montre", { spend: 80_000, sessions: 400, formStarts: 30 });
  const a = adviceOf([dead], dead.key);
  assert.equal(a.verdict, "cut");
  assert.equal(a.budgetChange, CUT_STEP);
  assert.ok(a.probProfitable! < 0.05);
  assert.ok(a.reasons.some((r) => r.includes("sans commande")));
  const early = adviceOf([line("montre", { spend: 40_000, sessions: 200 })], "facebook|montre");
  assert.equal(early.verdict, "wait");
  assert.ok(early.reasons.some((r) => r.includes("couper")));
});

test("a loser with one broken stage is fixed when fixing it is enough, cut when it is not", () => {
  const healthy = line("sain", { spend: 200_000, cancelled: 8, delivered: 24, back: 5, open: 0, sessions: 1_600 });
  // 2 % of product views start the form, against 12 % elsewhere: the page is the problem.
  const page = line("page", { spend: 400_000, cancelled: 3, delivered: 6, back: 1, sessions: 3_000, productViews: 2_900, formStarts: 58 });
  // Same over-cost, but every stage like the rest: nothing to fix, the traffic is just too dear.
  const dear = line("chere", { spend: 400_000, cancelled: 3, delivered: 6, back: 1, sessions: 400 });
  const r = run([healthy, page, dear]);
  const fix = r.rows.find((a) => a.key === page.key)!;
  assert.equal(fix.verdict, "fix");
  assert.equal(fix.budgetChange, FIX_STEP);
  assert.equal(fix.bottleneck?.stage, "formStart");
  assert.equal(fix.bottleneck?.referenceKind, "account");
  assert.ok(fix.reasons.some((r) => r.includes("Corrigé, le coût par livrée serait d'environ")));
  const cut = r.rows.find((a) => a.key === dear.key)!;
  assert.equal(cut.verdict, "cut");
  const insight = r.insights.find((i) => i.key === page.key && i.severity === "warning")!;
  assert.match(insight.evidence, /Formulaire commencé 2 % contre 12 % pour le reste du compte/);
});

test("money out and no visit counted: the measure is broken, not the ad", () => {
  const noUtm = line("sans-utm", { spend: 45_000, sessions: 0, impressions: 20_000, clicks: 300 });
  const a = adviceOf([winner, noUtm], noUtm.key);
  assert.equal(a.verdict, "tracking");
  assert.equal(a.budgetChange, null);
  assert.equal(a.bottleneck, null);
  const r = run([winner, noUtm]);
  const i = r.insights.find((x) => x.key === noUtm.key)!;
  assert.equal(i.severity, "critical");
  assert.equal(i.fix, "links");
  assert.match(i.action, /utm_campaign=sans-utm/);
  // 500 clicks and 40 visits: the link does not carry the campaign.
  const lost = line("mauvais-lien", { spend: 50_000, sessions: 40, clicks: 500, impressions: 30_000 });
  assert.equal(adviceOf([lost], lost.key).verdict, "tracking");
});

test("orders but no visit recorded (ad-level visits before utm_content was captured): judged on the orders, not called broken", () => {
  const ad = line("video-1", { level: "ad", spend: 120_000, cancelled: 3, delivered: 14, back: 3, open: 2, sessions: 0, productViews: 0, formStarts: 0, impressions: 40_000, clicks: 700 });
  const a = adviceOf([ad], ad.key);
  assert.notEqual(a.verdict, "tracking");
  assert.equal(a.verdict, "scale");
  assert.notEqual(a.bottleneck?.stage, "landing");
  assert.ok(a.reasons.some((r) => r.includes("Aucune visite comptée")));
});

test("orders placed without a form-start event do not make the page look unconvincing", () => {
  // Quick-buy orders: 30 orders, only 5 form starts recorded.
  const quick = line("rapide", { spend: 150_000, cancelled: 4, delivered: 20, back: 4, open: 2, sessions: 1_200, productViews: 1_150, formStarts: 5 });
  const other = line("autre", { spend: 150_000, cancelled: 4, delivered: 20, back: 4, open: 2, sessions: 1_200, productViews: 1_150, formStarts: 140 });
  assert.equal(adviceOf([quick, other], quick.key).bottleneck, null, "same orders per product view as the other row");
  // The same row with half the orders per view is still caught, on orders per product view.
  const weak = line("rapide", { spend: 150_000, cancelled: 2, delivered: 9, back: 2, open: 2, sessions: 1_200, productViews: 1_150, formStarts: 5 });
  const neck = adviceOf([weak, other], weak.key).bottleneck!;
  assert.equal(neck.stage, "formStart");
  assert.match(neck.evidence, /^Commandes par fiche vue 1,3 % contre 2,6 % pour le reste du compte/);
});

test("a product that loses money before any ad: fix the price first, pause meanwhile", () => {
  const loss = line("perte", { spend: 100_000, cancelled: 2, delivered: 12, back: 2, unitCost: 62_000 });
  const r = run([loss], { baseline: { ...baseline, marginPerDelivered: null } });
  const a = r.rows[0];
  assert.ok(a.kpis.marginPerDelivered! < 0);
  assert.equal(a.verdict, "fix");
  assert.equal(a.budgetChange, CUT_STEP);
  const i = r.insights.find((x) => x.key === loss.key)!;
  assert.equal(i.severity, "critical");
  assert.match(i.title, /perd de l'argent avant la publicité/);
});

test("without the carrier cost: compared with the account average, low confidence, and the gap named", () => {
  const noCosts: Costs = { carrierPerParcel: null, returnPerParcel: null };
  const b = { ...baseline, marginPerDelivered: null };
  const cheap = line("pas-chere", { spend: 150_000, cancelled: 5, delivered: 30, back: 5 });
  const dear = line("chere", { spend: 300_000, cancelled: 5, delivered: 10, back: 3 });
  const r = advise({ rows: [cheap, dear], costs: noCosts, baseline: b, days: 14, tracking: pixels });
  for (const a of r.rows) {
    assert.equal(a.targetBasis, "account");
    assert.equal(a.confidence, "low");
  }
  // Cheaper than the account is not profitable: without the margin nothing is scaled or paused, only ranked.
  assert.equal(r.rows[0].verdict, "keep");
  assert.equal(r.rows[0].budgetChange, 0);
  assert.ok(r.rows[0].reasons.some((t) => t.includes("sans la marge rien ne dit qu'elle est rentable")));
  assert.equal(r.rows[1].verdict, "fix");
  assert.equal(r.rows[1].budgetChange, FIX_STEP);
  assert.ok(r.rows[1].reasons.some((t) => t.startsWith("Probabilité d'être sous la moyenne du compte")));
  assert.equal(r.total.advice.verdict, "wait");
  assert.match(r.total.advice.reasons[0], /coût du transporteur non renseigné/);
  const missing = r.insights.find((i) => i.title === "Coût du transporteur manquant")!;
  assert.equal(missing.fix, "costs");
  assert.ok(r.insights.some((i) => i.title === "Coût d'un retour manquant"));
});

test("no spend entered: nothing to judge, and the missing spend is flagged", () => {
  const free = line("sans-depense", { spend: null, cancelled: 2, delivered: 10, back: 2 });
  const r = run([winner, free]);
  const a = r.rows.find((x) => x.key === free.key)!;
  assert.equal(a.verdict, "wait");
  assert.equal(a.budgetChange, null);
  const i = r.insights.find((x) => x.title === "Dépenses manquantes")!;
  assert.equal(i.fix, "import");
  assert.match(i.evidence, /« sans-depense »/);
});

const day = (i: number, d: Partial<DayPoint>): DayPoint => ({ day: `2026-10-${String(5 + i).padStart(2, "0")}`, spend: 40_000, impressions: 10_000, clicks: 200, sessions: 170, orders: 5, delivered: 0, ...d });
// 7 days at 2 % CTR and a 4 DT CPM, then 3 days at 1,3 % and 5,2 DT.
const tiring = Array.from({ length: 10 }, (_, i) => (i < 7 ? day(i, {}) : day(i, { spend: 52_000, clicks: 130, sessions: 110, orders: 3 })));

test("fatigue: CTR falling while CPM rises", () => {
  const f = fatigue(tiring, 3.1)!;
  assert.equal(f.level, "clear");
  assert.equal(f.basis, "platform");
  assert.ok(Math.abs(f.ctr!.change + 0.35) < 1e-9);
  assert.ok(Math.abs(f.cpm!.change - 0.3) < 1e-9);
  assert.match(f.evidence, /CTR 2 % → 1,3 % \(−35 %\)/);
  // The same drop without a CPM rise or a high frequency: only early.
  assert.equal(fatigue(tiring.map((p) => ({ ...p, spend: 40_000 })), 1.4)!.level, "early");
  // Stable: nothing.
  assert.equal(fatigue(Array.from({ length: 10 }, (_, i) => day(i, {})))!.level, "none");
  // A dip on small numbers is noise: 2 % → 1,7 % on 1 000 impressions a day.
  const noise = Array.from({ length: 10 }, (_, i) => day(i, i < 7 ? { impressions: 1_000, clicks: 20 } : { impressions: 1_000, clicks: 17 }));
  assert.equal(fatigue(noise)!.level, "none");
  // Too few days to say.
  assert.equal(fatigue(tiring.slice(0, 5)), null);
});

test("fatigue without platform figures: the cost per visit, never more than early", () => {
  const visits = tiring.map((p, i) => ({ ...p, impressions: null, clicks: null, sessions: i < 7 ? 170 : 100 }));
  const f = fatigue(visits, 4)!;
  assert.equal(f.basis, "visits");
  assert.equal(f.level, "early");
  assert.match(f.evidence, /impossible de dire si c'est le CTR ou le CPM/);
});

test("a tiring winner is kept, not scaled; so is one whose audience is saturated", () => {
  const a = adviceOf([winner], winner.key, { daily: { [winner.key]: tiring } });
  assert.equal(a.verdict, "keep");
  assert.equal(a.budgetChange, 0);
  assert.equal(a.fatigue?.level, "clear");
  assert.ok(run([winner], { daily: { [winner.key]: tiring } }).insights.some((i) => i.title === "« lampe-oct » s'use"));
  const saturated = line("lampe-oct", { spend: 300_000, cancelled: 10, delivered: 32, back: 6, open: 2, impressions: 120_000, reach: 30_000, clicks: 2_400 });
  const s = adviceOf([saturated], saturated.key);
  assert.equal(s.verdict, "keep");
  assert.ok(s.reasons.some((r) => r.includes("fréquence atteint 4")));
});

test("a winner whose orders confirm badly only takes the small step", () => {
  const good = line("bonne", { spend: 200_000, cancelled: 6, delivered: 26, back: 5, open: 0 });
  // 40 cancelled out of 86: cheap orders, many never confirmed.
  const fakes = line("promo", { spend: 300_000, cancelled: 40, delivered: 40, back: 6, sessions: 3_000 });
  const a = adviceOf([good, fakes], fakes.key);
  assert.equal(a.verdict, "scale");
  assert.equal(a.bottleneck?.stage, "confirmation");
  assert.equal(a.budgetChange, SCALE_STEP);
  assert.ok(a.reasons.some((r) => r.startsWith("À améliorer en même temps : trop de commandes non confirmées")));
});

test("cheap deliveries out of a pile of fake orders: not scaled before the cancellations are fixed", () => {
  const good = line("bonne", { spend: 200_000, cancelled: 6, delivered: 26, back: 5, open: 0 });
  // 50 cancelled out of 80, 25 delivered: 31 % of the orders end delivered, about 3 orders handled for a sale.
  const fakes = line("promo", { spend: 300_000, cancelled: 50, delivered: 25, back: 5, sessions: 3_000 });
  const a = adviceOf([good, fakes], fakes.key);
  assert.ok(a.judgedCpd! < 0.4 * a.target!, "cheap per delivered order");
  assert.equal(a.verdict, "keep");
  assert.equal(a.budgetChange, 0);
  assert.ok(a.reasons.some((r) => r.includes("seules 31 % des commandes finissent livrées") && r.includes("3,2 commandes à appeler")));
});

test("the platform counting more purchases than the shop has orders", () => {
  const over = line("promo", { spend: 300_000, cancelled: 20, delivered: 40, back: 8, open: 4, purchases: 130 });
  const r = run([over]);
  assert.ok(r.insights.some((i) => i.key === over.key && i.title.includes("la plateforme compte trop d'achats")));
  assert.ok(r.insights.some((i) => i.key === null && i.title === "La plateforme compte plus d'achats que la boutique"));
  // Decisions never use the platform's count.
  assert.equal(r.rows[0].verdict, adviceOf([{ ...over, platform: { ...over.platform, purchases: null } }], over.key).verdict);
  const under = line("promo", { spend: 300_000, cancelled: 20, delivered: 40, back: 8, open: 4, purchases: 12 });
  assert.ok(run([under]).insights.some((i) => i.title === "Le pixel ne voit qu'une partie des commandes"));
});

test("tracking setup: no pixel, no server link while the purchase waits for confirmation, a pixel learning from fake orders", () => {
  const noPixel = run([winner], { tracking: { ...pixels, metaPixel: false } });
  const p = noPixel.insights.find((i) => i.title === "Pixel Meta absent")!;
  assert.equal(p.severity, "critical");
  assert.equal(p.fix, "tracking");
  const blind = run([winner], { tracking: { ...pixels, metaCapi: false, purchaseAt: "confirmed" } });
  assert.equal(blind.insights.find((i) => i.title === "Meta ne reçoit aucun achat")?.severity, "critical");
  const browserOnly = run([winner], { tracking: { ...pixels, metaCapi: false, purchaseAt: "placed" } });
  assert.ok(browserOnly.insights.some((i) => i.title === "API Conversions Meta non reliée"));
  // 40 % of called orders never confirmed, and the pixel is told at "placed".
  const fakes = line("promo", { spend: 300_000, cancelled: 40, delivered: 45, back: 10, open: 5 });
  const learning = run([fakes], { tracking: { ...pixels, purchaseAt: "placed" } }).insights.find((i) => i.title === "Le pixel apprend sur des commandes jamais confirmées")!;
  assert.match(learning.action, /« quand la commande est confirmée par téléphone »/);
  // No TikTok spend: no TikTok advice.
  assert.ok(!noPixel.insights.some((i) => i.title.includes("TikTok")));
  const tagged = run([winner], { coverage: { orders: 200, tagged: 100 } }).insights.find((i) => i.title === "Commandes sans source")!;
  assert.equal(tagged.fix, "links");
  assert.match(tagged.evidence, /50 % des 200 commandes/);
});

test("one row carrying the account, money to move from losers to winners, budget spread too thin", () => {
  const dead = line("montre", { spend: 80_000, sessions: 400, formStarts: 30 });
  const r = run([winner, dead, line("petite", { spend: 50_000, delivered: 2, back: 1, cancelled: 1 })]);
  assert.ok(r.insights.some((i) => i.title === "Tout repose sur « lampe-oct »"));
  const move = r.insights.find((i) => i.title === "Déplacer le budget")!;
  assert.match(move.evidence, /libère environ 5,714 DT par jour/, "80 DT over 14 days, cut entirely");
  const thin = run([winner, ...[1, 2, 3, 4, 5].map((n) => line(`test-${n}`, { spend: 60_000, delivered: 1, open: 1 }))]);
  assert.ok(thin.insights.some((i) => i.title === "Budget trop éparpillé"));
});

const governorates: SegmentRow[] = [
  { label: "Tunis", orders: 300, confirmed: 230, delivered: 180, back: 30 },
  { label: "Sfax", orders: 120, confirmed: 85, delivered: 60, back: 12 },
  { label: "Kasserine", orders: 60, confirmed: 35, delivered: 18, back: 14 },
  { label: "Ariana", orders: 100, confirmed: 75, delivered: 60, back: 10 },
  { label: "Tozeur", orders: 8, confirmed: 2, delivered: 1, back: 1 },
];

test("audience: a governorate that refuses more is flagged, a tiny one is not judged", () => {
  const read = readSegments(governorates);
  const k = read.find((r) => r.label === "Kasserine")!;
  assert.equal(k.deliveryFlag, "worse");
  assert.equal(k.confirmFlag, "worse");
  assert.ok(k.deliveryProbWorse! > 0.99);
  assert.ok(k.deliveryCi!.high < 0.75);
  const t = read.find((r) => r.label === "Tozeur")!;
  assert.equal(t.confirmFlag, null, "8 orders say nothing");
  assert.equal(t.confirmProbWorse, null);
  const insights = segmentInsights("governorate", governorates);
  assert.equal(insights[0].title, "Kasserine : moins de confirmations et plus de refus");
  assert.match(insights[0].evidence, /^Confirmation 58 % sur 60 commandes appelées, contre 74 % ailleurs/);
  assert.match(insights[0].evidence, /Refus 44 % sur 32 colis, contre 15 % ailleurs/);
  assert.ok(insights.length <= 3);
});

test("audience: orders not called yet stay out of the confirmation rate; weekdays and devices as the data layer sends them", () => {
  // 60 orders, 20 of them placed last night and not called yet: 35 of 40 called is a good rate, not 58 %.
  const read = readSegments([{ ...governorates[2], pending: 20 }, ...governorates.slice(0, 2)]);
  assert.ok(Math.abs(read[0].confirmRate! - 35 / 40) < 1e-12);
  assert.equal(read[0].confirmFlag, null);
  const days = segmentInsights("weekday", [
    { label: "5", orders: 120, confirmed: 60, delivered: 40, back: 10 },
    { label: "1", orders: 300, confirmed: 230, delivered: 160, back: 30 },
  ]);
  assert.equal(days[0].title, "Les commandes du vendredi : moins de confirmations");
  const devices = segmentInsights("device", [
    { label: "desktop", orders: 100, confirmed: 85, delivered: 70, back: 30 },
    { label: "mobile", orders: 500, confirmed: 400, delivered: 330, back: 40 },
  ]);
  assert.equal(devices[0].title, "Les commandes depuis un ordinateur : plus de refus");
});

test("audience: many segments do not raise false alarms by chance", () => {
  // 19 confirmed of 40 (48 %) against 75 % elsewhere: clear when it is one of two segments…
  const odd = { label: "X", orders: 40, confirmed: 19, delivered: 0, back: 0 };
  const two = readSegments([odd, { label: "Y", orders: 400, confirmed: 300, delivered: 0, back: 0 }]);
  assert.equal(two[0].confirmFlag, "worse");
  // …and still flagged among 24, while ordinary differences of a few points are not.
  const many = [odd, ...Array.from({ length: 23 }, (_, i) => ({ label: `G${i}`, orders: 40, confirmed: 28 + (i % 5), delivered: 0, back: 0 }))];
  const read = readSegments(many);
  assert.equal(read[0].confirmFlag, "worse");
  assert.equal(read.slice(1).filter((r) => r.confirmFlag != null).length, 0);
  // A milder gap passes alone but not among 24.
  const mild = { label: "Z", orders: 60, confirmed: 36, delivered: 0, back: 0 };
  assert.equal(readSegments([mild, { label: "Y", orders: 600, confirmed: 450, delivered: 0, back: 0 }])[0].confirmFlag, "worse");
  assert.equal(readSegments([mild, ...many.slice(1)])[0].confirmFlag, null);
});

test("audience: hours grouped into blocks, a better governorate suggested", () => {
  const hours = Array.from({ length: 24 }, (_, h) => ({ label: String(h), orders: h < 4 ? 15 : 30, confirmed: h < 4 ? 6 : 23, delivered: h < 4 ? 4 : 16, back: h < 4 ? 2 : 4 }));
  const blocks = hourBlocks(hours);
  assert.equal(blocks.length, 6);
  assert.equal(blocks[0].label, "0 h – 4 h");
  assert.equal(blocks.reduce((s, b) => s + b.orders, 0), hours.reduce((s, h) => s + h.orders, 0));
  assert.deepEqual(hourBlocks(governorates), governorates, "not hours: unchanged");
  const night = segmentInsights("hour", hours);
  assert.equal(night[0].title, "Les commandes de 0 h à 4 h : moins de confirmations");
  const best = segmentInsights("governorate", [
    { label: "Sousse", orders: 200, confirmed: 180, delivered: 150, back: 8 },
    { label: "Gafsa", orders: 300, confirmed: 200, delivered: 140, back: 40 },
    { label: "Nabeul", orders: 300, confirmed: 205, delivered: 150, back: 38 },
  ]).find((i) => i.severity === "good")!;
  assert.equal(best.title, "Sousse : de meilleurs clients");
});

const ads = [
  line("video-ugc", { level: "ad", spend: 220_000, cancelled: 8, delivered: 20, back: 4, open: 8, pending: 2, sessions: 900, impressions: 60_000, clicks: 1_000 }),
  line("carrousel", { level: "ad", spend: 200_000, cancelled: 4, delivered: 6, back: 2, open: 1, sessions: 700, impressions: 70_000, clicks: 800 }),
  line("photo", { level: "ad", spend: 30_000, cancelled: 1, open: 1, sessions: 150, impressions: 15_000, clicks: 160 }),
];

test("ads compared: the probability of being the cheapest per delivered order, with ranges", () => {
  const c = compareAds(ads, "cost", costs, baseline);
  const sum = c.reduce((s, x) => s + (x.probBest ?? 0), 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(c[0].probBest! > 0.9);
  assert.ok(c[0].low! < c[0].value! && c[0].value! < c[0].high!);
  assert.equal(c[2].enough, false, "under 3 delivered orders");
  const ctr = compareAds(ads, "ctr", costs, baseline);
  assert.ok(Math.abs(ctr[0].value! - 1_000 / 60_000) < 1e-12);
  assert.ok(ctr[0].probBest! > 0.99);
  const r = run(ads);
  assert.ok(r.ads != null && r.ads.length === 3);
  const best = r.insights.find((i) => i.title === "« video-ugc » est la meilleure publicité")!;
  assert.equal(best.fix, "brief");
  assert.doesNotMatch(best.evidence, /: 100 %/, "a probability is never shown as a certainty");
  assert.equal(run([winner]).ads, null, "campaign rows: no ad comparison");
});

test("ads without enough data each: say so instead of naming a winner", () => {
  const thin = [1, 2, 3].map((n) => line(`pub-${n}`, { level: "ad", spend: 20_000, delivered: 1, open: 1 }));
  const i = creativeInsights(thin, costs, baseline);
  assert.equal(i.length, 1);
  assert.equal(i[0].title, "Pas assez de données par publicité");
});

test("the whole report: critical first, numbers in every evidence, plain text, deterministic", () => {
  const rows = [
    winner,
    youngWinner,
    line("montre", { spend: 80_000, sessions: 400, formStarts: 30 }),
    line("sans-utm", { spend: 45_000, sessions: 0 }),
    line("promo", { spend: 300_000, cancelled: 50, delivered: 25, back: 5, sessions: 3_000, purchases: 130 }),
  ];
  const input: AdviseInput = { rows, costs, baseline, days: 14, tracking: { ...pixels, purchaseAt: "placed", metaCapi: false }, coverage: { orders: 200, tagged: 120 }, segments: { governorate: governorates } };
  const r = advise(input);
  const rank = { critical: 0, warning: 1, good: 2, info: 3 };
  for (let i = 1; i < r.insights.length; i++) assert.ok(rank[r.insights[i - 1].severity] <= rank[r.insights[i].severity]);
  assert.equal(r.insights[0].severity, "critical");
  const texts = [...r.insights.flatMap((i) => [i.title, i.evidence, i.action]), ...r.rows.flatMap((a) => a.reasons), ...r.total.advice.reasons];
  for (const t of texts) {
    assert.ok(!t.includes("!"), t);
    assert.ok(!/NaN|undefined|Infinity|null|\[object/.test(t), t);
  }
  for (const i of r.insights) assert.match(i.evidence, /\d/, i.title);
  assert.deepEqual(advise(input), r);
});

test("an ad gets no budget percentage: kept or switched off, its ad set holds the budget", () => {
  const good = line("video-1", { level: "ad", spend: 300_000, cancelled: 10, delivered: 32, back: 6, open: 2 });
  const dead = line("photo-2", { level: "ad", spend: 80_000, sessions: 400, formStarts: 30 });
  const r = run([good, dead]);
  const [g, d] = r.rows;
  assert.equal(g.verdict, "scale");
  assert.equal(g.budgetChange, null);
  assert.ok(g.reasons.some((t) => t.includes("couper les publicités perdantes de son ensemble")));
  assert.equal(d.verdict, "cut");
  assert.equal(d.budgetChange, CUT_STEP);
  assert.ok(d.reasons.some((t) => t.includes("la désactiver")));
  assert.ok(r.insights.some((i) => i.title === "« video-1 » est gagnante"));
  assert.ok(!r.insights.some((i) => i.title === "Déplacer le budget"), "an ad set shares its budget by itself");
  // The account is the sum of its lines: no budget step of its own.
  assert.equal(r.total.advice.budgetChange, null);
});

test("the account is only 'scale' when one of its lines is", () => {
  // Profitable as a whole, but the winner wears out: no line to scale.
  const r = run([winner], { daily: { [winner.key]: tiring } });
  assert.equal(r.rows[0].verdict, "keep");
  assert.equal(r.total.advice.verdict, "keep");
  assert.equal(r.total.advice.budgetChange, null);
  assert.equal(run([winner]).total.advice.verdict, "scale");
});

test("platform stages are compared within the platform, an ad with the other ads of its campaign", () => {
  const meta = line("meta-1", { spend: 300_000, cancelled: 5, delivered: 30, back: 6, open: 2, impressions: 150_000, clicks: 2_000, sessions: 1_600 });
  // TikTok's CPM is 2,5 times Meta's: not a fault of this campaign, the platform prices differently.
  const tiktok = line("tt-1", { source: "tiktok", spend: 300_000, cancelled: 5, delivered: 14, back: 6, open: 2, impressions: 60_000, clicks: 600, sessions: 500 });
  assert.notEqual(adviceOf([meta, tiktok], tiktok.key).bottleneck?.stage, "cpm");
  // Against another TikTok campaign it is compared, and the text says with what.
  const tiktok2 = line("tt-2", { source: "tiktok", spend: 300_000, cancelled: 5, delivered: 30, back: 6, open: 2, impressions: 150_000, clicks: 1_500, sessions: 1_200 });
  const neck = adviceOf([meta, tiktok, tiktok2], tiktok.key).bottleneck!;
  assert.equal(neck.stage, "cpm");
  assert.equal(neck.referenceKind, "platform");
  assert.match(neck.evidence, /pour le reste du compte TikTok/);
  // Two ads of one campaign: the page stage is held against the other ad of the same campaign, not the other product's.
  const ad = (n: string, campaign: string, formStarts: number, delivered: number) => {
    const row = line(n, { level: "ad", spend: 200_000, cancelled: 3, delivered, back: 2, sessions: 2_000, productViews: 1_900, formStarts });
    return { ...row, key: `facebook|${campaign}|${n}`, campaign };
  };
  const a1 = ad("a1", "lampe", 60, 8);
  const a2 = ad("a2", "lampe", 240, 30);
  const other = ad("b1", "montre", 60, 8);
  const n1 = adviceOf([a1, a2, other], a1.key).bottleneck!;
  assert.equal(n1.stage, "formStart");
  assert.equal(n1.referenceKind, "campaign");
  assert.match(n1.evidence, /pour les autres publicités de la campagne/);
});

test("a winner waits for 3 days of spend and for its calls before more budget", () => {
  const twoDays = Array.from({ length: 10 }, (_, i) => day(i, { spend: i < 8 ? 0 : 150_000, impressions: null, clicks: null, sessions: i < 8 ? 0 : 400 }));
  const a = adviceOf([winner], winner.key, { daily: { [winner.key]: twoDays } });
  assert.equal(a.verdict, "keep");
  assert.equal(a.budgetChange, 0);
  assert.ok(a.reasons.some((t) => t.includes(`attendre ${MIN_SCALE_DAYS} jours`)));
  // 18 of 30 orders not called yet: the projection is mostly the shop's rates, not this campaign's buyers.
  const uncalled = line("appels", { spend: 60_000, cancelled: 1, delivered: 6, back: 1, open: 22, pending: 18, sessions: 900 });
  const u = adviceOf([uncalled], uncalled.key);
  assert.equal(u.verdict, "keep");
  assert.ok(u.reasons.some((t) => t.includes("n'ont pas encore été appelées")));
});

test("the budget per day is today's, not the period's average", () => {
  // Started 4 days before the end of a 14-day period, at 75 DT a day.
  const late = Array.from({ length: 14 }, (_, i) => ({ day: `2026-10-${String(5 + i).padStart(2, "0")}`, spend: i < 10 ? 0 : 75_000, impressions: null, clicks: null, sessions: i < 10 ? 0 : 300, orders: i < 10 ? 0 : 10, delivered: 0 }));
  const a = adviceOf([winner], winner.key, { daily: { [winner.key]: late } });
  assert.equal(a.spendPerDay, 75_000);
  assert.equal(adviceOf([winner], winner.key).spendPerDay, Math.round(300_000 / 14));
});

test("a row with no delivered order yet is judged on the account's margin when the shop's is unknown", () => {
  const b = { ...baseline, marginPerDelivered: null };
  const fresh = line("fresh", { spend: 50_000, open: 6, pending: 4 });
  const r = advise({ rows: [winner, fresh], costs, baseline: b, days: 14, tracking: pixels });
  const a = r.rows.find((x) => x.key === fresh.key)!;
  assert.equal(a.kpis.marginBasis, "account");
  assert.equal(a.targetBasis, "margin");
  assert.equal(a.target, r.total.advice.kpis.marginPerDelivered);
  assert.equal(a.verdict, "wait", "50 DT is not yet twice a 38 DT max");
});

test("the platform's purchases are compared with the orders it was told about", () => {
  // Told at confirmation: 50 purchases for 52 confirmed orders is right, not under-counting against 72 placed.
  const row = line("promo", { spend: 300_000, cancelled: 20, delivered: 40, back: 8, open: 4, purchases: 50 });
  const confirmed = run([row], { tracking: { ...pixels, purchaseAt: "confirmed" } });
  assert.ok(Math.abs(confirmed.rows[0].kpis.overReporting! - 50 / 52) < 1e-12);
  assert.ok(!confirmed.insights.some((i) => i.title === "Le pixel ne voit qu'une partie des commandes"));
  // Told at delivery, 50 purchases for 40 delivered orders.
  const delivered = run([{ ...row, platform: { ...row.platform, purchases: 70 } }], { tracking: { ...pixels, purchaseAt: "delivered" } });
  const over = delivered.insights.find((i) => i.title === "La plateforme compte plus d'achats que la boutique")!;
  assert.match(over.evidence, /^70 achats comptés pour 40 commandes livrées\.$/);
});

test("purchases sent at delivery that arrive after the 7 days in which an ad is credited", () => {
  const slow = { ...baseline, daysToDeliver: 6 };
  const late = run([winner], { baseline: slow, tracking: { ...pixels, purchaseAt: "delivered" } }).insights.find((i) => i.title === "L'achat arrive trop tard pour les publicités")!;
  assert.equal(late.severity, "warning");
  assert.match(late.evidence, /en moyenne 6 jours/);
  assert.match(late.action, /quand la commande est confirmée par téléphone/);
  assert.ok(!run([winner], { tracking: { ...pixels, purchaseAt: "delivered" } }).insights.some((i) => i.title === "L'achat arrive trop tard pour les publicités"), "3 days to deliver: in time");
});

test("a clean buyer audience for a lookalike once the purchase is sent after the call", () => {
  const i = run([winner], { tracking: { ...pixels, purchaseAt: "confirmed" } }).insights.find((x) => x.title === "Une audience similaire à partir des vrais acheteurs")!;
  assert.equal(i.severity, "info");
  assert.match(i.evidence, /Environ 648 commandes confirmées sur 180 jours/);
  assert.ok(!run([winner], { tracking: { ...pixels, purchaseAt: "placed" } }).insights.some((x) => x.title.startsWith("Une audience similaire")), "placed: the audience holds the fake orders");
  assert.ok(!run([winner], { tracking: { ...pixels, purchaseAt: "confirmed" }, baseline: { ...baseline, orders: 60 } }).insights.some((x) => x.title.startsWith("Une audience similaire")), "under 100 buyers");
});

test("forms started and not finished: call them back, the numbers are kept", () => {
  const healthy = line("sain", { spend: 200_000, cancelled: 6, delivered: 26, back: 5, sessions: 2_000, productViews: 1_900, formStarts: 90 });
  const leaky = line("fuite", { spend: 400_000, cancelled: 6, delivered: 26, back: 5, sessions: 2_000, productViews: 1_900, formStarts: 400 });
  const r = run([healthy, leaky]);
  const a = r.rows.find((x) => x.key === leaky.key)!;
  assert.equal(a.verdict, "scale");
  assert.equal(a.bottleneck?.stage, "formCompletion");
  // The step up and the leak in the same insight, with the page to fix it.
  const i = r.insights.find((x) => x.key === leaky.key)!;
  assert.equal(i.title, "Monter « fuite »");
  assert.equal(i.fix, "carts");
  assert.match(i.action, /En même temps, le formulaire perd des clients : appeler dans la journée les formulaires commencés sans commande \(leur numéro est gardé dans Commandes non terminées\)/);
});

/** Every sentence of a report: titles, evidence, actions, and every reason of every row and of the account. */
const allTexts = (r: Report) => [...r.insights.flatMap((i) => [i.title, i.evidence, i.action]), ...r.rows.flatMap((a) => a.reasons), ...r.total.advice.reasons];

test("texts send the owner to places that exist: Paramètres (Livraison, Pixels publicitaires) and Produits", () => {
  const unknownCost = { ...winner, funnel: { ...winner.funnel, costUnknownDelivered: 3 } };
  const r = advise({ rows: [unknownCost], costs: { carrierPerParcel: null, returnPerParcel: null }, baseline: { ...baseline, marginPerDelivered: null }, days: 14, tracking: { ...pixels, metaPixel: false } });
  for (const t of allTexts(r)) assert.doesNotMatch(t, /Réglages|rubrique/, t);
  assert.match(r.insights.find((i) => i.title === "Coût du transporteur manquant")!.action, /Paramètres, carte « Livraison »/);
  assert.match(r.insights.find((i) => i.title === "Coût d'un retour manquant")!.action, /Paramètres, carte « Livraison »/);
  assert.match(r.insights.find((i) => i.title === "Coût fournisseur manquant")!.action, /dans Produits/);
  assert.match(r.insights.find((i) => i.title === "Pixel Meta absent")!.action, /Paramètres, carte « Pixels publicitaires »/);
  const capi = run([winner], { tracking: { ...pixels, metaCapi: false, purchaseAt: "placed" } }).insights.find((i) => i.title === "API Conversions Meta non reliée")!;
  assert.match(capi.action, /Paramètres, carte « Pixels publicitaires »/);
});

test("close to the max: the action follows what the lines are", () => {
  const near = line("a", { spend: 420_000, cancelled: 6, delivered: 14, back: 3 });
  const headline = (r: Report) => r.insights.find((i) => i.key == null && i.title.startsWith("Le compte "))!;
  // A line marked "cut": named.
  const withCut = run([near, line("b", { spend: 100_000, sessions: 500 })]);
  assert.equal(withCut.rows[1].verdict, "cut");
  assert.equal(headline(withCut).title, "Le compte est proche du coût max");
  assert.equal(headline(withCut).action, "Couper « b » avant de monter quoi que ce soit.");
  // Nothing to cut: no "couper" at all, the account's weakest stage instead.
  const noCut = run([near, line("c", { spend: 400_000, cancelled: 6, delivered: 13, back: 3 })]);
  assert.ok(!noCut.rows.some((a) => a.verdict === "cut"));
  assert.equal(headline(noCut).title, "Le compte est proche du coût max");
  assert.doesNotMatch(headline(noCut).action, /[Cc]ouper/);
  assert.match(headline(noCut).action, /^Corriger le point faible du compte/);
  // A line whose measure is broken comes before the stage.
  const broken = run([near, line("c", { spend: 400_000, cancelled: 6, delivered: 13, back: 3 }), line("sans-utm", { spend: 45_000, sessions: 0 })]);
  assert.match(headline(broken).action, /^Réparer d'abord le lien de « sans-utm »/);
  assert.equal(headline(broken).fix, "links");
});

test("the account's own reasons speak of the account, not of a line", () => {
  const free = line("sans-depense", { spend: null, cancelled: 2, delivered: 10, back: 2 });
  const r = run([free]);
  assert.match(r.rows[0].reasons[0], /pour cette ligne/);
  assert.match(r.total.advice.reasons[0], /pour le compte/);
  const noVisit = line("video-1", { level: "ad", spend: 120_000, cancelled: 3, delivered: 14, back: 3, open: 2, sessions: 0, productViews: 0, formStarts: 0 });
  const t = run([noVisit]).total.advice.reasons;
  assert.ok(t.some((x) => x.startsWith("Aucune visite comptée pour le compte") && x.includes("jugé sur ses commandes")));
  for (const x of [...t, ...r.total.advice.reasons]) assert.doesNotMatch(x, /cette ligne/, x);
});

test("one of something reads in the singular, everywhere", () => {
  // One parcel back, one delivered order without a supplier cost, one visit for 500 clicks.
  const one = line("une", { spend: 60_000, delivered: 1, back: 1, cancelled: 1, open: 1, pending: 1, sessions: 1, clicks: 500, impressions: 20_000, purchases: 1 });
  const r = advise({ rows: [{ ...one, funnel: { ...one.funnel, costUnknownDelivered: 1 } }], costs: { carrierPerParcel: 7_000, returnPerParcel: null }, baseline, days: 14, tracking: pixels });
  assert.match(r.insights.find((i) => i.title === "Coût d'un retour manquant")!.evidence, /^1 colis est revenu sur la période ; son coût/);
  assert.match(r.insights.find((i) => i.title === "Coût fournisseur manquant")!.evidence, /^1 commande livrée n'a pas de coût fournisseur : sa marge/);
  assert.match(r.rows[0].reasons[0], /^500 clics comptés par la plateforme, 1 visite dans la boutique/);
  for (const t of allTexts(r)) assert.doesNotMatch(t, /\(s\)|\b1 (commandes|livrées|visites|clics|achats|jours|colis sont|colis envoyés)\b/, t);
});

test("a broken ad link names its utm_content, a campaign's its utm_campaign", () => {
  const ad = line("video-2", { level: "ad", spend: 45_000, sessions: 0 });
  const i = run([ad]).insights.find((x) => x.key === ad.key)!;
  assert.equal(i.action, "Vérifier que le lien de la publicité contient utm_source=facebook, utm_campaign=lampe et utm_content=video-2, exactement comme la dépense saisie ; le recréer avec le générateur de liens.");
  const campaign = run([line("sans-utm", { spend: 45_000, sessions: 0 })]).insights.find((x) => x.key === "facebook|sans-utm")!;
  assert.match(campaign.action, /contient utm_source=facebook et utm_campaign=sans-utm,/);
  assert.doesNotMatch(campaign.action, /utm_content/);
});

test("orders confirmed then cancelled are reported apart when they matter", () => {
  const row = line("promo", { spend: 300_000, cancelled: 20, delivered: 40, back: 8, open: 4 });
  // 8 of the 20 cancellations came after the call had confirmed the order.
  const late = { ...row, funnel: { ...row.funnel, confirmed: row.funnel.confirmed + 8 } };
  const r = run([late]);
  const k = r.rows[0].kpis;
  assert.ok(k.confirmRate! + k.cancelRate! <= 1 + 1e-12);
  const i = r.insights.find((x) => x.title === "Des commandes annulées après confirmation")!;
  assert.match(i.evidence, /^8 commandes confirmées au téléphone ont été annulées avant l'envoi : 13 % des confirmées\./);
  assert.ok(!run([row]).insights.some((x) => x.title === "Des commandes annulées après confirmation"));
});

test("account-wide spend statements use the source rows when given, as the overview's tile does", () => {
  // 300 DT typed on the campaign, 150 DT more typed for Facebook without a campaign.
  const source = { ...totalOf([winner]), level: "source" as const, key: "facebook", source: "facebook" };
  const sources = [{ ...source, platform: { ...source.platform, spend: 450_000 } }];
  const noPixel = { ...pixels, metaPixel: false };
  assert.match(run([winner], { tracking: noPixel }).insights.find((i) => i.title === "Pixel Meta absent")!.evidence, /^300,000 DT dépensés sur Meta/);
  assert.match(run([winner], { tracking: noPixel, sources }).insights.find((i) => i.title === "Pixel Meta absent")!.evidence, /^450,000 DT dépensés sur Meta/);
  // A campaign without spend of its own, while Facebook has spend typed without a campaign: entered, not missing.
  const unpaid = line("sans-depense", { spend: null, cancelled: 2, delivered: 10, back: 2 });
  assert.ok(run([winner, unpaid]).insights.some((i) => i.title === "Dépenses manquantes"));
  assert.ok(!run([winner, unpaid], { sources }).insights.some((i) => i.title === "Dépenses manquantes"));
});

test("the account's verdict and its headline follow one rule", () => {
  const heavy = line("appels", { spend: 60_000, cancelled: 1, delivered: 6, back: 1, open: 75, pending: 70, sessions: 900 });
  const cases: AdRow[][] = [
    [winner],
    [winner, heavy],
    [winner, line("montre", { spend: 80_000, sessions: 400, formStarts: 30 })],
    [line("a", { spend: 420_000, cancelled: 6, delivered: 14, back: 3 })],
    [line("chere", { spend: 400_000, cancelled: 3, delivered: 6, back: 1, sessions: 400 })],
    [line("montre", { spend: 80_000, sessions: 400, formStarts: 30 }), line("chere", { spend: 400_000, cancelled: 3, delivered: 6, back: 1, sessions: 400 })],
    [youngWinner],
  ];
  for (const rows of cases) {
    const r = run(rows);
    const a = r.total.advice;
    const h = r.insights.find((i) => i.key == null && i.title.startsWith("Le compte "));
    const label = rows.map((x) => x.key).join(", ");
    if (a.verdict === "scale" || (a.verdict === "keep" && a.probProfitable! >= WIN_PROB)) assert.equal(h?.title, "Le compte est rentable", label);
    else if ((a.verdict === "cut" || a.verdict === "fix") && a.probProfitable! <= LOSE_PROB) assert.equal(h?.title, "Le compte perd de l'argent", label);
    else assert.match(h?.title ?? "", /^Le compte est (proche du|au-dessus du) coût max$/, label);
    assert.equal(a.verdict === "scale", r.rows.some((x) => x.verdict === "scale"), label);
  }
  // A winner next to a line whose orders are mostly not called yet: the account goes up through its winner,
  // and the headline names it, instead of saying "scale" while the verdict says "wait for the calls".
  const r = run([winner, heavy]);
  assert.equal(r.total.advice.verdict, "scale");
  assert.match(r.insights.find((i) => i.title === "Le compte est rentable")!.action, /^Monter seulement « lampe-oct »/);
});

// 23 days at 8 DT an order (5 orders for 40 DT), then 7 days at 13,333 DT (3 orders for 40 DT).
const trendDays = (recentOrders: number, recentDays = TREND_RECENT_DAYS) =>
  Array.from({ length: 30 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, spend: 40_000, impressions: null, clicks: null, sessions: 200, orders: i >= 30 - recentDays ? recentOrders : 5, delivered: 0 }));

test("a winner whose last 7 days cost clearly more per order is held, with both figures", () => {
  const t = costTrend(trendDays(3))!;
  assert.equal(t.recent.orders, 21);
  assert.equal(t.base.orders, 115);
  assert.ok(Math.abs(t.change - (40_000 / 3 / 8_000 - 1)) < 1e-9);
  assert.equal(t.worse, true);
  const r = run([winner], { daily: { [winner.key]: trendDays(3) } });
  const a = r.rows[0];
  assert.equal(a.verdict, "keep");
  assert.equal(a.budgetChange, 0);
  assert.match(a.decision!, /^Rentable sur la période, mais les 7 derniers jours coûtent 13,333 DT par commande contre 8,000 DT avant \(\+67 %\)/);
  const i = r.insights.find((x) => x.title === "« lampe-oct » coûte plus cher depuis 7 jours")!;
  assert.equal(i.severity, "warning");
  assert.match(i.evidence, /^13,333 DT par commande sur les 7 derniers jours \(21 commandes\), contre 8,000 DT avant \(23 jours, 115 commandes\) : \+67 %\./);
  // A small rise, or too few recent orders to say, does not hold it.
  assert.equal(costTrend(trendDays(4.6))!.worse, false);
  assert.equal(costTrend(trendDays(1)), null);
  assert.equal(run([winner], { daily: { [winner.key]: trendDays(5) } }).rows[0].verdict, "scale");
});

test("orders waiting for a call for more than 48 h get their own insight, with the shop's measured rate", () => {
  const stale = (n: number) => ({ ...youngWinner, funnel: { ...youngWinner.funnel, pendingStale: n } });
  const r = run([stale(6)], { baseline: { ...baseline, staleDeliveredRate: 0.22 } });
  const i = r.insights.find((x) => x.title === "6 commandes attendent un appel depuis plus de 48 h")!;
  assert.equal(i.fix, "orders");
  assert.match(i.evidence, /^6 commandes sur 10 en attente d'appel ont été passées il y a plus de 48 h\. Dans la boutique, 22 % des commandes restées sans appel aussi longtemps finissent livrées, contre 55 % de toutes les commandes\.$/);
  assert.ok(!run([stale(4)]).insights.some((x) => x.title.includes("attendent un appel")), "4 orders: not yet worth an alert");
  // Without the measured rate they are left out of the projection, which says it is a minimum.
  assert.equal(run([stale(6)]).rows[0].kpis.projection!.floor, true);
});

const delays = (fast: [number, number], slow: [number, number]): CallDelayRow[] => [
  { bucket: "1h", label: "moins d'1 h", orders: fast[0], confirmed: fast[1] },
  { bucket: "4h", label: "1 à 4 h", orders: 40, confirmed: 30 },
  { bucket: "24h", label: "4 à 24 h", orders: slow[0], confirmed: slow[1] },
  { bucket: "later", label: "plus de 24 h", orders: 10, confirmed: 4 },
  { bucket: "never", label: "sans appel noté", orders: 30, confirmed: 2 },
];

test("calling late costs confirmations: said when the data is clear, silent when it is thin", () => {
  const i = callDelayInsight(delays([120, 100], [40, 26]))!;
  assert.equal(i.action, "Appeler dans l'heure qui suit chaque commande.");
  assert.equal(i.fix, "orders");
  assert.match(i.evidence, /^Confirmation 83 % sur 120 commandes appelées en moins d'1 h, contre 60 % sur 50 commandes appelées après plus de 4 h\./);
  assert.equal(callDelayInsight(delays([12, 11], [40, 26])), null, "12 fast calls say nothing");
  assert.equal(callDelayInsight(delays([120, 90], [40, 30])), null, "75 % against 68 %: no clear gap");
  assert.ok(run([winner], { callDelay: delays([120, 100], [40, 26]) }).insights.some((x) => x.title === "Les commandes appelées tard se confirment moins"));
});
