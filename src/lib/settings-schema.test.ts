import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSettings, publicSettings, DEFAULT_SETTINGS } from "./settings-schema";

test("defaults cover all 24 governorates", () => {
  assert.equal(Object.keys(DEFAULT_SETTINGS.delivery.zones).length, 24);
});

test("stored settings merge over defaults section by section", () => {
  const s = mergeSettings({ shop: { name: "Mena TN" }, delivery: { zones: { Tunis: { fee: 5000, minDays: 0, maxDays: 1, enabled: true } } } });
  assert.equal(s.shop.name, "Mena TN");
  assert.equal(s.shop.tagline, DEFAULT_SETTINGS.shop.tagline);
  assert.equal(s.delivery.zones.Tunis.fee, 5000);
  assert.equal(s.delivery.zones.Sfax.fee, 8000);
});

test("garbage falls back to defaults, one section at a time", () => {
  const s = mergeSettings({ returns: { days: 2 }, shop: { name: "Mena TN" } });
  assert.equal(s.returns.days, 10);
  assert.equal(s.shop.name, "Mena TN");
  assert.deepEqual(mergeSettings("nope"), DEFAULT_SETTINGS);
});

test("card payment is only public when configured", () => {
  const s = mergeSettings({ payments: { card: true, konnectWalletId: "" } });
  assert.equal(publicSettings(s).payments.card, false);
});
