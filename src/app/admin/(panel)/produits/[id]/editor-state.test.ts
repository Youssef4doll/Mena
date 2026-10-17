import { test } from "node:test";
import assert from "node:assert/strict";
import { afterSave, formKey, type Held } from "./editor-state";

test("a save with nothing typed meanwhile: the form is drawn again with the saved rows", () => {
  const h = afterSave(null, false, "v0");
  assert.equal(h, null);
  assert.equal(formKey(h, "v1"), "v1");
});

test("typed during a save: the form keeps its key whatever versions arrive", () => {
  const h = afterSave(null, true, "v0");
  assert.equal(formKey(h, "v0"), "v0");
  assert.equal(formKey(h, "v1"), "v0");
  // Typed again during the next save: still held.
  const again = afterSave(h, true, "v1");
  assert.equal(formKey(again, "v2"), "v0");
});

test("a later save with nothing typed ends the hold once its own rows arrive, not before", () => {
  const h = afterSave(afterSave(null, true, "v0"), false, "v1");
  // The answer of that save has not been drawn yet: no remount from the older rows.
  assert.equal(formKey(h, "v1"), "v0");
  assert.equal(formKey(h, "v2"), "v2");
});

test("a hold that has ended does not come back, and a new one starts from the current version", () => {
  const ended: Held = afterSave(afterSave(null, true, "v0"), false, "v1");
  assert.equal(formKey(ended, "v2"), "v2");
  assert.equal(afterSave(ended, false, "v2"), null);
  assert.deepEqual(afterSave(ended, true, "v2"), { key: "v2" });
});
