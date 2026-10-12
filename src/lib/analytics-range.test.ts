import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRange, tunisMidnight, tunisDay, delta, daysOf } from "./analytics-range";

const now = new Date("2026-10-12T23:30:00Z"); // 00:30 on the 13th in Tunis

test("days are Tunis days", () => {
  assert.equal(tunisDay(now), "2026-10-13");
  assert.equal(tunisMidnight(now).toISOString(), "2026-10-12T23:00:00.000Z");
});

test("presets end tonight and the previous period touches them", () => {
  const r = parseRange({ p: "7" }, now);
  assert.equal(r.days, 7);
  assert.equal(r.to.toISOString(), "2026-10-13T23:00:00.000Z");
  assert.equal(r.prevTo.getTime(), r.from.getTime());
  assert.equal(daysOf(r).length, 7);
  assert.equal(daysOf(r)[6], "2026-10-13");
});

test("custom ranges are inclusive and clamped", () => {
  const r = parseRange({ p: "custom", from: "2026-09-01", to: "2026-09-30" }, now);
  assert.equal(r.days, 30);
  const big = parseRange({ p: "custom", from: "2020-01-01", to: "2026-09-30" }, now);
  assert.equal(big.days, 366);
  assert.equal(parseRange({ p: "nonsense" }, now).key, "30");
});

test("deltas", () => {
  assert.equal(delta(12, 10), 0.2);
  assert.equal(delta(0, 0), 0);
  assert.equal(delta(5, 0), null);
});
