import { test } from "node:test";
import assert from "node:assert/strict";
import { KPI_DEFS, funnelSteps, kpiValue, kpis, pendingOf, totalRow, whyMissing, type KpiKey } from "./kpis";
import { profit } from "../profit";
import type { AdRow, Baseline, Costs, Funnel, Platform } from "./types";

const funnel = (f: Partial<Funnel> = {}): Funnel => ({
  sessions: 0, visitors: 0, productViews: 0, formStarts: 0, orders: 0, confirmed: 0, cancelled: 0, shipped: 0, delivered: 0, back: 0, open: 0,
  revenuePlaced: 0, revenueDelivered: 0, productCostDelivered: 0, costUnknownDelivered: 0, units: 0, multiUnitOrders: 0, newCustomers: 0, ...f,
});
const platform = (p: Partial<Platform> = {}): Platform => ({ spend: null, impressions: null, clicks: null, reach: null, purchases: null, ...p });
const row = (f: Partial<Funnel>, p: Partial<Platform> = {}): AdRow => ({ level: "campaign", key: "facebook|lampe-oct", source: "facebook", campaign: "lampe-oct", ad: null, funnel: funnel(f), platform: platform(p) });

const costs: Costs = { carrierPerParcel: 7_000, returnPerParcel: 3_000 };
const baseline: Baseline = { orders: 900, confirmRate: 0.72, deliveryRate: 0.8, netDeliveryRate: 0.55, aov: 70_000, daysToDeliver: 3, marginPerDelivered: 35_000 };

// A campaign whose 60 orders are all final: 12 cancelled, 40 delivered, 8 back. A 67,900 DT order (lamp + delivery), 20 DT of supplier cost.
const mature = row(
  {
    sessions: 2_400, visitors: 2_100, productViews: 2_300, formStarts: 260, orders: 60, confirmed: 50, cancelled: 12, shipped: 48, delivered: 40, back: 8, open: 0, pending: 0,
    revenuePlaced: 48 * 67_900, revenueDelivered: 40 * 67_900, productCostDelivered: 40 * 20_000, units: 52, multiUnitOrders: 4, newCustomers: 55,
  },
  { spend: 450_000, impressions: 150_000, clicks: 3_000, reach: 60_000, purchases: 66 },
);

// Three days old: 20 orders, 10 not called yet, 8 confirmed and waiting to ship, nothing delivered.
const young = row({ sessions: 700, productViews: 680, formStarts: 70, orders: 20, confirmed: 8, cancelled: 2, open: 18, pending: 10, revenuePlaced: 18 * 67_900, units: 18 }, { spend: 60_000 });

const near = (a: number | null, b: number, tol = 1e-9) => assert.ok(a != null && Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test("platform, landing and funnel KPIs of a mature campaign", () => {
  const k = kpis(mature, costs, baseline);
  assert.equal(k.cpm, 3_000, "3 DT per 1 000 impressions");
  near(k.ctr, 0.02);
  assert.equal(k.cpc, 150);
  near(k.frequency, 2.5);
  near(k.landingRate, 0.8);
  assert.equal(k.costPerVisit, 188);
  near(k.viewRate, 2_300 / 2_400);
  near(k.formStartRate, 260 / 2_300);
  near(k.formCompletion, 60 / 260);
  near(k.orderRate, 0.025);
});

test("cash-on-delivery quality and money KPIs of a mature campaign", () => {
  const k = kpis(mature, costs, baseline);
  assert.equal(k.pending, 0);
  assert.equal(k.decided, 60);
  assert.equal(k.final, 60);
  near(k.confirmRate, 50 / 60);
  near(k.cancelRate, 0.2);
  near(k.deliveryRate, 40 / 48);
  near(k.netDeliveryRate, 40 / 60);
  near(k.openShare, 0);
  assert.equal(k.aov, 67_900);
  near(k.unitsPerOrder, 52 / 48);
  near(k.multiUnitShare, 4 / 48);
  near(k.newCustomerShare, 55 / 60);
  assert.equal(k.cpaPlaced, 7_500);
  assert.equal(k.costPerConfirmed, 9_000);
  assert.equal(k.costPerDelivered, 11_250, "the true cost of a customer who paid");
  near(k.roasDelivered, (40 * 67_900) / 450_000);
  near(k.overReporting, 66 / 60);
});

test("profit before ads is src/lib/profit.ts's; the margin per delivered order uses the shrunk delivery rate", () => {
  const k = kpis(mature, costs, baseline);
  const p = profit({ deliveredRevenue: 40 * 67_900, delivered: 40, productCost: 800_000, costUnknown: 0, parcels: 48, backParcels: 8, carrierPerParcel: 7_000, returnPerParcel: 3_000, adSpend: 450_000 });
  assert.equal(k.profitBeforeAds, p.beforeAds);
  assert.equal(k.profitBeforeAds, 1_556_000);
  assert.equal(k.contribution, 1_106_000);
  near(k.poas, 1_556_000 / 450_000);
  // Delivery rate 40/48 pulled toward the shop's 80 %: (40 + 16) / 68. Row margin 38,757 DT, blended 40:5 with the shop's 35 DT.
  const own = kpis(mature, costs, { ...baseline, marginPerDelivered: null });
  assert.equal(own.marginBasis, "row");
  assert.equal(own.marginPerDelivered, 38_757);
  assert.equal(k.marginBasis, "blend");
  assert.equal(k.marginPerDelivered, Math.round((40 * 38_757 + 5 * 35_000) / 45));
  assert.equal(k.breakEvenCpd, k.marginPerDelivered);
  assert.equal(k.breakEvenCpa, Math.round(k.breakEvenCpd! * (40 / 60)));
  near(k.breakEvenRoas, 67_900 / k.marginPerDelivered!);
  assert.equal(k.projection?.projected, false, "every order is final: no projection");
  assert.equal(k.projection?.delivered, 40);
  assert.equal(k.projection?.costPerDelivered, 11_250);
});

test("a young campaign with many open orders gets a projection, labelled as one", () => {
  const k = kpis(young, costs, baseline);
  assert.equal(k.pending, 10);
  near(k.confirmRate, 0.8, 1e-12);
  near(k.openShare, 0.9);
  // Its own 0 of 2 final orders delivered says nothing yet.
  near(k.netDeliveryRate, 0);
  assert.equal(k.costPerDelivered, null);
  const pr = k.projection!;
  assert.equal(pr.projected, true);
  // Confirmation 8/10 pulled toward 72 % with 20 virtual calls; delivery: the shop's 80 % (no parcel yet).
  near(pr.confirmExpect, (8 + 14.4) / 30);
  near(pr.deliveryExpect, 0.8);
  const expected = 8 * 0.8 + 10 * ((8 + 14.4) / 30) * 0.8;
  near(pr.delivered, expected, 1e-9);
  assert.equal(pr.costPerDelivered, Math.round(60_000 / expected));
  near(pr.netDeliveryRate, expected / 20);
  assert.equal(pr.contribution, Math.round(expected * 35_000 - 60_000));
  assert.match(pr.note, /^Projection : 0 livrée \+ 18 en cours, dont environ 12 devraient être livrées/);
  assert.equal(k.marginBasis, "shop", "no delivered order of its own: the shop's margin");
  assert.equal(k.breakEvenCpa, Math.round(35_000 * (expected / 20)));
});

test("pending orders are estimated when the field is absent", () => {
  const { pending, ...rest } = young.funnel;
  void pending;
  assert.equal(pendingOf(rest), 10, "orders − confirmed − cancelled");
  assert.equal(kpis({ ...young, funnel: rest }, costs, baseline).projection?.delivered, kpis(young, costs, baseline).projection?.delivered);
  assert.equal(pendingOf(funnel({ orders: 5, confirmed: 5, cancelled: 2, open: 0 })), 0, "never negative");
});

test("without the shop's rates, open orders cannot be projected", () => {
  const k = kpis(young, costs, null);
  assert.equal(k.projection, null);
  assert.ok(k.missing.includes("baseline"));
  assert.equal(k.breakEvenCpd, null, "no delivered order and no shop margin");
});

test("a missing input leaves its KPIs empty and says why", () => {
  const k = kpis(row({ sessions: 300, orders: 6, delivered: 2, shipped: 3, back: 1, cancelled: 2, open: 1, confirmed: 4, revenueDelivered: 135_800, productCostDelivered: 40_000, revenuePlaced: 4 * 67_900 }), { carrierPerParcel: null, returnPerParcel: null }, baseline);
  for (const key of ["cpm", "ctr", "cpc", "frequency", "landingRate", "costPerVisit", "cpaPlaced", "costPerDelivered", "roasDelivered", "poas", "overReporting"] as const) assert.equal(k[key], null, key);
  assert.deepEqual(k.missing, ["spend", "impressions", "clicks", "reach", "purchases", "carrierCost", "returnCost"]);
  assert.equal(k.profitBeforeAds, null);
  assert.equal(k.marginBasis, "shop", "the row's own margin needs the carrier cost; the shop's margin stands in");
  assert.deepEqual(whyMissing(k, "cpm"), ["spend", "impressions"]);
  assert.deepEqual(whyMissing(k, "profitBeforeAds"), ["carrierCost", "returnCost"]);
  assert.deepEqual(whyMissing(k, "orderRate"), [], "nothing missing: just no visit yet when empty");
  // A delivered order without a supplier cost.
  const unknown = kpis({ ...mature, funnel: { ...mature.funnel, costUnknownDelivered: 3 } }, costs, null);
  assert.ok(unknown.missing.includes("productCost"));
  assert.equal(unknown.marginPerDelivered, null);
  assert.equal(unknown.profitBeforeAds, null);
});

test("an empty row: every KPI is null or a real number, never NaN or Infinity", () => {
  const k = kpis(row({}, { spend: 0, impressions: 0, clicks: 0, reach: 0, purchases: 0 }), costs, baseline);
  for (const key of Object.keys(KPI_DEFS) as KpiKey[]) {
    const v = kpiValue(k, key);
    assert.ok(v == null || Number.isFinite(v), `${key} = ${v}`);
  }
  assert.equal(k.orderRate, null);
  assert.equal(k.cpm, null);
  assert.equal(k.projection, null);
});

test("every KPI has a French label and a one-line explanation", () => {
  for (const [key, def] of Object.entries(KPI_DEFS)) {
    assert.ok(def.label.length > 0 && def.help.length > 10, key);
    assert.ok(!def.help.includes("!"), key);
  }
});

test("the account line sums the rows; a platform figure nobody has stays unknown", () => {
  const t = totalRow([mature, young]);
  assert.equal(t.key, "total");
  assert.equal(t.funnel.orders, 80);
  assert.equal(t.funnel.pending, 10);
  assert.equal(t.platform.spend, 510_000);
  assert.equal(t.platform.impressions, 150_000, "only the rows that have it");
  assert.equal(totalRow([young]).platform.impressions, null);
  const { pending, ...noPending } = young.funnel;
  void pending;
  assert.equal(totalRow([mature, { ...young, funnel: noPending }]).funnel.pending, undefined, "estimated later, not summed from a guess");
});

test("the funnel bar: each step with the share of the step before", () => {
  const steps = funnelSteps(mature);
  assert.deepEqual(steps.map((s) => s.key), ["impressions", "clicks", "sessions", "productViews", "formStarts", "orders", "confirmed", "delivered"]);
  near(steps[1].rate, 0.02);
  near(steps[5].rate, 60 / 260);
  assert.equal(steps[0].rate, null);
  const noPlatform = funnelSteps(young);
  assert.equal(noPlatform[1].count, null);
  assert.equal(noPlatform[2].rate, null, "visits per click: no clicks imported");
});
