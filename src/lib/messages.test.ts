import { test } from "node:test";
import assert from "node:assert/strict";
import { placedText, confirmWhatsApp, waLink } from "./messages";

const order = { ref: "MN-ABC234", name: "Amira Ben Salah", total: 57_900, locale: "fr" };

test("placed SMS names the order, the amount and the call", () => {
  const t = placedText(order, "Mena", "https://mena.tn/suivi/t/x");
  assert.match(t, /MN-ABC234/);
  assert.match(t, /57,900 DT/);
  assert.match(t, /Amira/);
  assert.doesNotMatch(t, /!/);
});

test("arabic texts for arabic orders", () => {
  const t = confirmWhatsApp({ ...order, locale: "ar", items: [{ name: "Lampe", qty: 1 }], city: "Sfax", governorate: "Sfax" }, "Mena");
  assert.match(t, /نأكدو/);
});

test("wa.me links carry the country code", () => {
  assert.equal(waLink("22123456", "a b"), "https://wa.me/21622123456?text=a%20b");
});
