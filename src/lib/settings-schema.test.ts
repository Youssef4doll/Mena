import { test } from "node:test";
import assert from "node:assert/strict";
import { bannerLink, heroSlides, mergeSettings, publicSettings, DEFAULT_SETTINGS } from "./settings-schema";

test("defaults cover all 24 governorates", () => {
  assert.equal(Object.keys(DEFAULT_SETTINGS.delivery.zones).length, 24);
});

test("stored settings merge over defaults section by section", () => {
  const s = mergeSettings({ shop: { name: "Mena TN" }, delivery: { fee: 6000, zones: { Tunis: { minDays: 0, maxDays: 1, enabled: true } } } });
  assert.equal(s.shop.name, "Mena TN");
  assert.equal(s.shop.tagline, DEFAULT_SETTINGS.shop.tagline);
  assert.equal(s.delivery.fee, 6000);
  assert.equal(s.delivery.zones.Tunis.maxDays, 1);
  assert.equal(s.delivery.zones.Sfax.maxDays, 3);
});

test("settings saved with a fee per governorate read as one fee of 8 DT", () => {
  const s = mergeSettings({ delivery: { carrierName: "X", zones: { Tunis: { fee: 7000, minDays: 1, maxDays: 2, enabled: true }, Tozeur: { fee: 9000, minDays: 3, maxDays: 4, enabled: false } } } });
  assert.equal(s.delivery.fee, 8000);
  assert.equal(s.delivery.carrierName, "X");
  assert.equal(s.delivery.zones.Tozeur.enabled, false);
  assert.equal("fee" in s.delivery.zones.Tunis, false);
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

test("home banners: the old single picture still shows; links go to a shop page or an https address", () => {
  const hero = { title: "", titleAr: "", imageId: "m1", slides: [] };
  assert.deepEqual(heroSlides(hero), [{ imageId: "m1", link: "", alt: "", altAr: "" }]);
  assert.equal(heroSlides({ ...hero, slides: [{ imageId: "m2", link: "/boutique", alt: "", altAr: "" }] })[0].imageId, "m2");
  assert.deepEqual(bannerLink("/produit/lampe"), { path: "/produit/lampe" });
  assert.deepEqual(bannerLink("/fr/categorie/maison"), { path: "/categorie/maison" });
  assert.deepEqual(bannerLink("https://www.facebook.com/mena.tn"), { url: "https://www.facebook.com/mena.tn" });
  assert.equal(bannerLink("//evil.example"), null);
  assert.equal(bannerLink("javascript:alert(1)"), null);
  assert.equal(bannerLink("http://insecure.example"), null);
  // Stored settings without banners still read.
  assert.deepEqual(mergeSettings({ hero: { title: "x", titleAr: "y", imageId: null } }).hero.slides, []);
});
