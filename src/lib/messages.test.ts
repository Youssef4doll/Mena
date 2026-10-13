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
  const t = confirmWhatsApp({ ...order, locale: "ar", items: [{ name: "Lampe", qty: 1 }], address: "Rue de Tunis", city: "Sfax", governorate: "Sfax" }, "Mena");
  assert.match(t, /نأكدو/);
  assert.match(t, /Rue de Tunis، Sfax، صفاقس/);
});

test("confirmation names the street, and no empty city", () => {
  const t = confirmWhatsApp({ ...order, items: [{ name: "Lampe", qty: 1 }], address: "Sakiet Ezzit, rue 12", city: "", governorate: "Sfax" }, "Mena");
  assert.match(t, /Adresse : Sakiet Ezzit, rue 12, Sfax\n/);
  assert.doesNotMatch(t, /, ,|: ,/);
  assert.doesNotMatch(t, /!/);
});

test("confirmation lines carry the offer, in the order's language", () => {
  const items = [
    { name: "Diffuseur", qty: 3, offerLabel: "Achetez 2, la 3e offerte", offerLabelAr: "اشري 2 والثالثة هدية" },
    { name: "Lampe", qty: 1, offerLabel: null, offerLabelAr: null },
  ];
  const fr = confirmWhatsApp({ ...order, items, address: "Rue 1", city: "", governorate: "Tunis" }, "Mena");
  assert.match(fr, /• 3 × Diffuseur — Achetez 2, la 3e offerte\n/);
  assert.match(fr, /• 1 × Lampe\n/);
  const ar = confirmWhatsApp({ ...order, locale: "ar", items, address: "Rue 1", city: "", governorate: "Tunis" }, "Mena");
  assert.match(ar, /• 3 × Diffuseur — اشري 2 والثالثة هدية/);
  // No Arabic label: the French one rather than nothing.
  const fallback = confirmWhatsApp({ ...order, locale: "ar", items: [{ ...items[0], offerLabelAr: null }], address: "Rue 1", city: "", governorate: "Tunis" }, "Mena");
  assert.match(fallback, /— Achetez 2, la 3e offerte/);
});

test("wa.me links carry the country code", () => {
  assert.equal(waLink("22123456", "a b"), "https://wa.me/21622123456?text=a%20b");
});
