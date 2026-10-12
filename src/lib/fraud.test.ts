import { test } from "node:test";
import assert from "node:assert/strict";
import { orderFlags, isRisky, refusalRate } from "./fraud";

const clean = { blacklisted: false, delivered: 0, refused: 0, last24h: 0, duplicateOpen: false };

test("a new customer has no flags", () => {
  assert.deepEqual(orderFlags(clean, { maxPerDay: 3, phoneIsMobile: true }), []);
});

test("history and duplicates are flagged", () => {
  const f = orderFlags({ ...clean, refused: 2, delivered: 1, duplicateOpen: true, last24h: 3 }, { maxPerDay: 3, phoneIsMobile: false });
  assert.deepEqual(f, ["past_refusals:2", "serial_refuser", "past_delivered:1", "duplicate", "too_many_today", "landline"]);
  assert.equal(isRisky(f), true);
  assert.equal(isRisky(["past_delivered:4"]), false);
  assert.equal(isRisky(orderFlags({ ...clean, blacklisted: true }, { maxPerDay: 3, phoneIsMobile: true })), true);
});

test("refusal rate", () => {
  assert.equal(refusalRate(0, 0), null);
  assert.equal(refusalRate(3, 1), 0.25);
});
