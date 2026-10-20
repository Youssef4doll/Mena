import { test } from "node:test";
import assert from "node:assert/strict";
import { betaCdf, costInterval, gammaP, gammaQ, gammaQuantile, lnGamma, normalCdf, probBeats, probBestCost, probBestRate, probCostUnder, probRateAbove, shrink, wilson } from "./stats";

const close = (a: number | null, b: number, tol = 1e-6, msg?: string) => {
  assert.ok(a != null && Math.abs(a - b) <= tol, `${msg ?? ""} ${a} ≠ ${b} (±${tol})`);
};

/** Exact P(rate B > rate A) for integer Beta parameters (Evan Miller's closed form), to check the integration against. */
function exactBBeatsA(aA: number, bA: number, aB: number, bB: number): number {
  const lnB = (a: number, b: number) => lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  let t = 0;
  for (let i = 0; i < aB; i++) t += Math.exp(lnB(aA + i, bA + bB) - Math.log(bB + i) - lnB(1 + i, bB) - lnB(aA, bA));
  return t;
}

test("special functions match known values", () => {
  close(lnGamma(5), Math.log(24), 1e-12);
  close(lnGamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-12);
  close(gammaP(1, 2), 1 - Math.exp(-2), 1e-12);
  close(gammaP(3, 2), 1 - Math.exp(-2) * 5, 1e-12);
  close(gammaP(4.5, 3) + gammaQ(4.5, 3), 1, 1e-12);
  close(gammaQuantile(0.5, 1), Math.log(2), 1e-9);
  close(betaCdf(0.3, 2, 5), 0.579825, 1e-9);
  close(betaCdf(0.42, 1, 1), 0.42, 1e-12);
  close(normalCdf(1.96), 0.975, 1e-4);
  assert.equal(gammaQ(2, 0), 1);
  assert.equal(gammaP(2, 0), 0);
});

test("Wilson interval stays inside 0–1 on small samples, and is empty without data", () => {
  assert.equal(wilson(0, 0), null);
  const none = wilson(0, 10)!;
  assert.equal(none.rate, 0);
  assert.equal(none.low, 0);
  close(none.high, 0.2775, 1e-4, "0 of 10 can still be 28 %");
  const most = wilson(8, 10)!;
  close(most.low, 0.4902, 1e-4);
  close(most.high, 0.9433, 1e-4);
  // More successes than trials (orders without a form-start event) is read as all of them.
  assert.equal(wilson(12, 10)!.rate, 1);
});

test("shrinkage pulls a small row toward the shop, a big one barely", () => {
  close(shrink(3, 4, 0.7, 20), (3 + 14) / 24, 1e-12, "3 of 4 is not 75 %");
  close(shrink(300, 400, 0.7, 20), (300 + 14) / 420, 1e-12);
  assert.equal(shrink(3, 4, null, 20), 0.75, "no prior: the raw rate");
  assert.equal(shrink(0, 0, 0.7, 20), 0.7, "no data: the prior");
  assert.equal(shrink(0, 0, null, 20), null);
});

test("P(A beats B) matches the exact closed form on small counts", () => {
  for (const [sa, na, sb, nb] of [
    [10, 100, 5, 100],
    [3, 12, 9, 15],
    [0, 8, 2, 9],
    [40, 60, 30, 60],
    [150, 190, 120, 180],
  ]) {
    const exact = exactBBeatsA(sb + 1, nb - sb + 1, sa + 1, na - sa + 1);
    close(probBeats({ successes: sa, n: na }, { successes: sb, n: nb }), exact, 1e-5, `${sa}/${na} vs ${sb}/${nb}`);
  }
  close(probBeats({ successes: 10, n: 100 }, { successes: 10, n: 100 }), 0.5, 1e-9, "same data: a coin toss");
  const ab = probBeats({ successes: 7, n: 40 }, { successes: 3, n: 35 })!;
  const ba = probBeats({ successes: 3, n: 35 }, { successes: 7, n: 40 })!;
  close(ab + ba, 1, 1e-9);
  assert.equal(probBeats({ successes: 0, n: 0 }, { successes: 3, n: 10 }), null);
});

test("large counts (CTR on impressions) use the normal approximation and agree with it", () => {
  const p = probBeats({ successes: 700, n: 50_000 }, { successes: 600, n: 50_000 })!;
  const va = (701 * 49_301) / (50_002 ** 2 * 50_003);
  const vb = (601 * 49_401) / (50_002 ** 2 * 50_003);
  close(p, normalCdf((701 / 50_002 - 601 / 50_002) / Math.sqrt(va + vb)), 1e-9);
  assert.ok(p > 0.99);
});

test("probability of being the best of several rates sums to 1 and skips rows without data", () => {
  const r = probBestRate([{ successes: 10, n: 100 }, { successes: 5, n: 100 }, { successes: 0, n: 0 }]);
  assert.equal(r[2], null);
  close(r[0]! + r[1]!, 1, 1e-9);
  close(r[0], exactBBeatsA(6, 96, 11, 91), 1e-5, "two rows: the same as P(A beats B)");
  assert.deepEqual(probBestRate([{ successes: 3, n: 30 }]), [1]);
  const many = probBestRate(Array.from({ length: 6 }, (_, i) => ({ successes: 10 + i * 4, n: 400 })));
  close(many.reduce<number>((s, x) => s + (x ?? 0), 0), 1, 1e-9);
  assert.ok(many[5]! > many[0]!, "the highest rate is the most likely best");
});

test("P(true rate above a threshold)", () => {
  // 20 confirmed of 40: 99 % sure the rate is under 70 %.
  assert.ok(probRateAbove({ successes: 20, n: 40 }, 0.7)! < 0.01);
  close(probRateAbove({ successes: 0, n: 0 }, 0.5) ?? -1, -1, 0, "no data: null");
  close(probRateAbove({ successes: 5, n: 10 }, 0.5), 0.5, 1e-9, "symmetric");
});

test("P(cost per delivered under the max): Poisson counts in the spend", () => {
  // 0 delivered for 80 DT when the max is 35 DT: about 2.3 were expected.
  close(probCostUnder(0, 80_000, 35_000), gammaQ(0.5, 80 / 35), 1e-12);
  assert.ok(probCostUnder(0, 80_000, 35_000)! < 0.05);
  // 9 delivered for 120 DT, max 20 DT (6 needed): likely, not certain.
  close(probCostUnder(9, 120_000, 20_000), 0.8856, 1e-3);
  // More deliveries for the same spend: more likely.
  assert.ok(probCostUnder(12, 120_000, 20_000)! > probCostUnder(9, 120_000, 20_000)!);
  // Projected deliveries are not integers.
  assert.ok(probCostUnder(7.4, 120_000, 20_000)! > 0);
  assert.equal(probCostUnder(5, null, 20_000), null);
  assert.equal(probCostUnder(5, 100_000, null), null);
  assert.equal(probCostUnder(5, 0, 20_000), null);
});

test("credible range of a cost per delivered order", () => {
  const r = costInterval(10, 200_000)!;
  assert.ok(r.low < 20_000 && r.high! > 20_000, "contains spend / deliveries");
  assert.ok(r.low > 10_000 && r.high! < 40_000);
  const none = costInterval(0, 50_000)!;
  assert.equal(none.high, null, "no delivery: no upper bound");
  assert.ok(none.low > 0);
  assert.equal(costInterval(3, null), null);
});

test("cheapest of several ads: sums to 1, more deliveries for the same spend wins", () => {
  const r = probBestCost([{ events: 10, spend: 200_000 }, { events: 5, spend: 200_000 }, { events: 4, spend: null }]);
  assert.equal(r[2], null);
  close(r[0]! + r[1]!, 1, 1e-9);
  assert.ok(r[0]! > 0.85);
});

test("deterministic: the same data gives the same numbers", () => {
  const a = probBestRate([{ successes: 12, n: 300 }, { successes: 9, n: 280 }, { successes: 15, n: 310 }]);
  const b = probBestRate([{ successes: 12, n: 300 }, { successes: 9, n: 280 }, { successes: 15, n: 310 }]);
  assert.deepEqual(a, b);
});
