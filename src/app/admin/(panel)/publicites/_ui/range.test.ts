import { test } from "node:test";
import assert from "node:assert/strict";
import { adRange, periodQuery, periodText, rangeQuery, withPeriod } from "./range";

// 20 October 2026, 23:30 in Tunis (22:30 UTC): still the 20th there.
const NOW = new Date("2026-10-20T22:30:00Z");

test("a preset is the last N Tunisian days, today included, with the previous period of the same length", () => {
  const r = adRange({ p: "14" }, NOW);
  assert.equal(r.key, "14");
  assert.equal(r.label, "14 jours");
  assert.equal(r.days, 14);
  assert.equal(r.from.toISOString(), "2026-10-06T23:00:00.000Z", "Tunis midnight of 7 October");
  assert.equal(r.to.toISOString(), "2026-10-20T23:00:00.000Z", "Tunis midnight of 21 October, excluded");
  assert.equal(r.prevTo.getTime(), r.from.getTime());
  assert.equal(r.from.getTime() - r.prevFrom.getTime(), 14 * 86_400_000);
});

test("an unknown or missing preset gives the default 30 days", () => {
  assert.equal(adRange({}, NOW).days, 30);
  assert.equal(adRange({ p: "365" }, NOW).key, "30");
  assert.equal(adRange({ p: ["7", "14"] }, NOW).key, "30", "a repeated parameter is ignored");
});

test("a custom period keeps its days; a broken one falls back to the default", () => {
  const r = adRange({ p: "custom", from: "2026-10-01", to: "2026-10-10" }, NOW);
  assert.equal(r.key, "custom");
  assert.equal(r.days, 10);
  assert.equal(adRange({ p: "custom", from: "1 octobre", to: "2026-10-10" }, NOW).key, "30");
});

test("the period part of an address keeps only what adRange accepts", () => {
  assert.equal(periodQuery({ p: "14" }), "p=14");
  assert.equal(periodQuery({ p: "30" }), "", "the default needs nothing");
  assert.equal(periodQuery({ p: "custom", from: "2026-10-01", to: "2026-10-10" }), "p=custom&from=2026-10-01&to=2026-10-10");
  assert.equal(periodQuery({ p: "custom", from: "<script>", to: "2026-10-10" }), "");
  assert.equal(periodQuery({ p: "abc" }), "");
});

test("a Range gives back the address it came from", () => {
  assert.equal(rangeQuery(adRange({ p: "7" }, NOW)), "p=7");
  assert.equal(rangeQuery(adRange({ p: "30" }, NOW)), "");
  assert.equal(rangeQuery(adRange({ p: "custom", from: "2026-10-01", to: "2026-10-10" }, NOW)), "p=custom&from=2026-10-01&to=2026-10-10");
});

test("withPeriod appends to a path, a query or before an anchor", () => {
  assert.equal(withPeriod("/admin/publicites", "p=7"), "/admin/publicites?p=7");
  assert.equal(withPeriod("/admin/publicites/creatives?m=ctr", "p=7"), "/admin/publicites/creatives?m=ctr&p=7");
  assert.equal(withPeriod("/admin/publicites/campagnes#facebook", "p=7"), "/admin/publicites/campagnes?p=7#facebook");
  assert.equal(withPeriod("/admin/publicites", ""), "/admin/publicites");
});

test("the period reads as Tunisian days, the last one included", () => {
  assert.equal(periodText(adRange({ p: "7" }, NOW)), "du 14/10 au 20/10");
  assert.equal(periodText(adRange({ p: "custom", from: "2026-10-05", to: "2026-10-05" }, NOW)), "le 5/10");
});
