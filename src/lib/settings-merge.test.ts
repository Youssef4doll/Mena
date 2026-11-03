import { test } from "node:test";
import assert from "node:assert/strict";
import { applyChanges, changedFields } from "./settings-merge";

const base = { tracking: { metaPixelId: "", ga4Id: "" }, contact: { messenger: "", whatsapp: "22123456" }, delivery: { zones: { Tunis: { minDays: 1 } } } };

test("only the fields the form changed are written", () => {
  const next = { ...base, tracking: { ...base.tracking, ga4Id: "G-ABC123" } };
  assert.deepEqual(changedFields(base, next), [{ path: "tracking.ga4Id", value: "G-ABC123" }]);
  assert.deepEqual(changedFields(base, base), []);
});

test("an older form does not undo a change saved meanwhile elsewhere", () => {
  // Tab 1 saved the Pixel ID; tab 2, opened before, now saves the GA4 ID.
  const stored = { ...base, tracking: { metaPixelId: "927988233581522", ga4Id: "" } };
  const tab2 = { ...base, tracking: { metaPixelId: "", ga4Id: "G-N1DMXGF5WB" } };
  const { merged, conflicts } = applyChanges(stored, base, changedFields(base, tab2));
  assert.deepEqual(conflicts, []);
  assert.deepEqual(merged.tracking, { metaPixelId: "927988233581522", ga4Id: "G-N1DMXGF5WB" });
});

test("the same field changed in two places is a conflict, and nothing of it is written", () => {
  const stored = { ...base, tracking: { metaPixelId: "927988233581522", ga4Id: "" } };
  const tab2 = { ...base, tracking: { metaPixelId: "111111111111111", ga4Id: "" } };
  const r = applyChanges(stored, base, changedFields(base, tab2));
  assert.deepEqual(r.conflicts, ["tracking.metaPixelId"]);
  assert.equal(r.merged.tracking.metaPixelId, "927988233581522");
  // Both places typing the same value is no conflict.
  assert.deepEqual(applyChanges(stored, base, changedFields(base, stored)).conflicts, []);
});

test("deeper values are compared whole", () => {
  const next = { ...base, delivery: { zones: { Tunis: { minDays: 2 } } } };
  assert.deepEqual(changedFields(base, next).map((c) => c.path), ["delivery.zones"]);
});
