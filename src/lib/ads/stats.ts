/**
 * The statistics the ads advisor needs to tell a real difference from noise
 * on the small numbers a shop has: 40 orders, 12 parcels back. Pure and
 * deterministic (closed forms and fixed-grid integration, no sampling), so
 * the same data always gives the same verdict, and it is tested.
 *
 * Rates are Beta posteriors (uniform prior); costs per event are Gamma
 * posteriors on events per millime spent (Poisson counts, Jeffreys prior).
 *
 *   wilson(successes, n, z = 1.96)                → Interval | null
 *   shrink(successes, n, priorRate, strength)     → number | null
 *   probRateAbove(count, threshold)               → number | null   P(true rate > threshold)
 *   probBeats(a, b)                               → number | null   P(rate of a > rate of b)
 *   probBestRate(counts)                          → (number | null)[]  P(each has the highest rate)
 *   probCostUnder(events, spend, maxCost)         → number | null   P(true cost per event < maxCost)
 *   probBestCost(rows)                            → (number | null)[]  P(each has the lowest cost per event)
 *   costInterval(events, spend, level = 0.9)      → { low, high | null } | null
 *   normalCdf(z), lnGamma(x), gammaP(a, x), gammaQ(a, x), betaCdf(x, a, b), gammaQuantile(p, a)
 */

export type Count = { successes: number; n: number };
export type Interval = { rate: number; low: number; high: number };

/** Prior of a rate: Beta(1, 1), every rate equally likely before any data. */
const RATE_PRIOR = 1;
/** Prior shape of a Poisson rate (Jeffreys): zero events still leaves some chance. */
const COUNT_PRIOR = 0.5;
/** Above this many successes and failures a Beta is normal enough to skip the integration (skewness < 0.15). */
const NORMAL_ENOUGH = 200;
/** Grid points for the integrals; with the window at ±10 sd, 20+ points per sd. */
const GRID = 2000;
const FPMIN = 1e-300;

/**
 * Wilson score interval: honest at small n and near 0 or 1, where the usual
 * p ± 1.96·√(p(1−p)/n) gives negative rates or zero width. Null when n is 0.
 */
export function wilson(successes: number, n: number, z = 1.96): Interval | null {
  if (!(n > 0)) return null;
  const s = clamp(successes, 0, n);
  const p = s / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { rate: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/**
 * Empirical-Bayes shrinkage: a row's rate pulled toward the shop's usual rate,
 * as if the row had `strength` more orders at that rate. 3 confirmed of 4 is
 * not 75 %: with the shop at 70 % and a strength of 20, it reads 71 %. With no
 * prior it is the raw rate; with neither, null.
 */
export function shrink(successes: number, n: number, priorRate: number | null | undefined, strength: number): number | null {
  if (priorRate == null || !Number.isFinite(priorRate)) return n > 0 ? clamp(successes, 0, n) / n : null;
  if (!(n > 0)) return priorRate;
  return (clamp(successes, 0, n) + strength * priorRate) / (n + strength);
}

/** Probability that the true rate behind `c` is above `threshold` (Beta posterior). Null without data. */
export function probRateAbove(c: Count, threshold: number): number | null {
  if (!(c.n > 0)) return null;
  const [a, b] = betaParams(c);
  return 1 - betaCdf(clamp(threshold, 0, 1), a, b);
}

/** Probability that the true rate of `a` is above the true rate of `b`. Null when either has no data. */
export function probBeats(a: Count, b: Count): number | null {
  if (!(a.n > 0) || !(b.n > 0)) return null;
  const r = probBest([betaDist(a), betaDist(b)]);
  return r[0];
}

/** For each count, the probability that it has the highest true rate. Null for a count with no data. */
export function probBestRate(counts: Count[]): (number | null)[] {
  return probBestOf(counts.map((c) => (c.n > 0 ? betaDist(c) : null)));
}

/**
 * Probability that the true cost per event is under `maxCost`, after
 * `spend` bought `events` (deliveries can be a projection, so not an
 * integer). Events are Poisson in the spend; this is P(Gamma(events + ½) >
 * spend / maxCost): "if the true cost were the max, how surprising is it to
 * have seen this many?". Null without spend or a positive max.
 */
export function probCostUnder(events: number, spend: number | null, maxCost: number | null): number | null {
  if (spend == null || !(spend > 0) || maxCost == null || !(maxCost > 0)) return null;
  return gammaQ(Math.max(0, events) + COUNT_PRIOR, spend / maxCost);
}

/** For each row, the probability that its true cost per event is the lowest. Null for a row without spend. */
export function probBestCost(rows: { events: number; spend: number | null }[]): (number | null)[] {
  return probBestOf(rows.map((r) => (r.spend != null && r.spend > 0 ? gammaDist(Math.max(0, r.events) + COUNT_PRIOR, r.spend) : null)));
}

/**
 * Credible interval of the cost per event (millimes). With fewer than one
 * event the cost has no upper bound: `high` is null ("at least `low`").
 */
export function costInterval(events: number, spend: number | null, level = 0.9): { low: number; high: number | null } | null {
  if (spend == null || !(spend > 0)) return null;
  const k = Math.max(0, events) + COUNT_PRIOR;
  const tail = (1 - level) / 2;
  // Events per millime: Gamma(k, rate = spend). Cost = 1 / that.
  const hiRate = gammaQuantile(1 - tail, k) / spend;
  const loRate = gammaQuantile(tail, k) / spend;
  return { low: Math.round(1 / hiRate), high: events >= 1 && loRate > 0 ? Math.round(1 / loRate) : null };
}

// ── Distributions and the integral behind "which is best" ────────────────

type Dist = { mean: number; sd: number; lo: number; hi: number; pdf: (x: number) => number; cdf: (x: number) => number };

function betaParams(c: Count): [number, number] {
  const s = clamp(c.successes, 0, c.n);
  return [s + RATE_PRIOR, c.n - s + RATE_PRIOR];
}

function betaDist(c: Count): Dist {
  const [a, b] = betaParams(c);
  const mean = a / (a + b);
  const sd = Math.sqrt((a * b) / ((a + b) ** 2 * (a + b + 1)));
  if (Math.min(a, b) >= NORMAL_ENOUGH) return normalDist(mean, sd, 0, 1);
  const lnB = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  return {
    mean,
    sd,
    lo: 0,
    hi: 1,
    pdf: (x) => (x <= 0 || x >= 1 ? 0 : Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - lnB)),
    cdf: (x) => betaCdf(x, a, b),
  };
}

/** Gamma(shape k, rate) for events per millime. */
function gammaDist(k: number, rate: number): Dist {
  const mean = k / rate;
  const sd = Math.sqrt(k) / rate;
  if (k >= NORMAL_ENOUGH) return normalDist(mean, sd, 0, Infinity);
  const lnG = lnGamma(k);
  return {
    mean,
    sd,
    lo: 0,
    hi: Infinity,
    pdf: (x) => (x <= 0 ? 0 : Math.exp((k - 1) * Math.log(x) + k * Math.log(rate) - rate * x - lnG)),
    cdf: (x) => gammaP(k, rate * x),
  };
}

function normalDist(mean: number, sd: number, lo: number, hi: number): Dist {
  return {
    mean,
    sd,
    lo,
    hi,
    pdf: (x) => Math.exp(-0.5 * ((x - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI)),
    cdf: (x) => normalCdf((x - mean) / sd),
  };
}

function probBestOf(dists: (Dist | null)[]): (number | null)[] {
  const live = dists.map((d, i) => ({ d, i })).filter((x): x is { d: Dist; i: number } => x.d != null);
  const out: (number | null)[] = dists.map(() => null);
  if (live.length === 0) return out;
  if (live.length === 1) {
    out[live[0].i] = 1;
    return out;
  }
  const r = probBest(live.map((x) => x.d));
  live.forEach((x, j) => (out[x.i] = r[j]));
  return out;
}

/**
 * P(dist i is the largest) = ∫ f_i(x) · Π_{j≠i} F_j(x) dx, on one midpoint
 * grid spanning every distribution (±10 sd). Each f_i is renormalised on the
 * grid, which absorbs the discretisation error near a bounded edge.
 */
function probBest(dists: Dist[]): number[] {
  const lo = Math.max(Math.min(...dists.map((d) => d.lo)), Math.min(...dists.map((d) => d.mean - 10 * d.sd)));
  const hi = Math.min(Math.max(...dists.map((d) => d.hi)), Math.max(...dists.map((d) => d.mean + 10 * d.sd)));
  if (!(hi > lo)) return dists.map(() => 1 / dists.length);
  const step = (hi - lo) / GRID;
  const cdfs = dists.map((d) => {
    const v = new Float64Array(GRID);
    for (let g = 0; g < GRID; g++) v[g] = clamp(d.cdf(lo + (g + 0.5) * step), 0, 1);
    return v;
  });
  const raw = dists.map((d, i) => {
    let mass = 0;
    let win = 0;
    for (let g = 0; g < GRID; g++) {
      const f = d.pdf(lo + (g + 0.5) * step);
      if (!(f > 0) || !Number.isFinite(f)) continue;
      let others = 1;
      for (let j = 0; j < dists.length; j++) if (j !== i) others *= cdfs[j][g];
      mass += f;
      win += f * others;
    }
    return mass > 0 ? win / mass : 0;
  });
  const total = raw.reduce((s, x) => s + x, 0);
  return total > 0 ? raw.map((x) => x / total) : raw;
}

// ── Special functions ───────────────────────────────────────────────────

/** Standard normal CDF, from the complementary error function (relative error under 1.2e-7). */
export function normalCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}

function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

/** ln Γ(x) for x > 0 (Lanczos, about 15 significant digits). */
export function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const y = x - 1;
  let a = LANCZOS[0];
  const t = y + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (y + i);
  return 0.5 * Math.log(2 * Math.PI) + (y + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularised lower incomplete gamma P(a, x) = P(Gamma(a, 1) < x). */
export function gammaP(a: number, x: number): number {
  if (!(x > 0)) return 0;
  if (!Number.isFinite(x)) return 1;
  return x < a + 1 ? gammaSeries(a, x) : 1 - gammaFraction(a, x);
}

/** Regularised upper incomplete gamma Q(a, x) = P(Gamma(a, 1) > x), precise in the far tail. */
export function gammaQ(a: number, x: number): number {
  if (!(x > 0)) return 1;
  if (!Number.isFinite(x)) return 0;
  return x < a + 1 ? 1 - gammaSeries(a, x) : gammaFraction(a, x);
}

function gammaSeries(a: number, x: number): number {
  let ap = a;
  let term = 1 / a;
  let sum = term;
  for (let n = 0; n < 10_000; n++) {
    ap += 1;
    term *= x / ap;
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
  }
  return clamp(sum * Math.exp(-x + a * Math.log(x) - lnGamma(a)), 0, 1);
}

function gammaFraction(a: number, x: number): number {
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 10_000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return clamp(Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h, 0, 1);
}

/** Regularised incomplete beta I_x(a, b) = P(Beta(a, b) < x). */
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return clamp((front * betaFraction(x, a, b)) / a, 0, 1);
  return clamp(1 - (front * betaFraction(1 - x, b, a)) / b, 0, 1);
}

function betaFraction(x: number, a: number, b: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 10_000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

/** x such that P(Gamma(a, 1) < x) = p, by bisection (monotone, so always converges). */
export function gammaQuantile(p: number, a: number): number {
  if (p <= 0) return 0;
  let lo = 0;
  let hi = a + 20 * Math.sqrt(a) + 40;
  while (gammaP(a, hi) < p) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-12 * hi; i++) {
    const mid = (lo + hi) / 2;
    if (gammaP(a, mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
