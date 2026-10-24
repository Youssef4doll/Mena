import { test } from "node:test";
import assert from "node:assert/strict";
import { messengerUser, profileUrl, socialProblem } from "./social";

test("only a profile on the right site is a social link", () => {
  assert.equal(profileUrl("instagram", "https://www.instagram.com/"), "");
  assert.equal(profileUrl("instagram", "https://www.instagram.com/mena.tn/"), "https://www.instagram.com/mena.tn");
  assert.equal(profileUrl("instagram", "instagram.com/mena.tn"), "https://instagram.com/mena.tn");
  assert.equal(profileUrl("instagram", "@mena.tn"), "https://www.instagram.com/mena.tn");
  // The audit's case: an Instagram link in the Facebook field.
  assert.equal(profileUrl("facebook", "https://www.instagram.com/"), "");
  assert.equal(profileUrl("facebook", "https://web.facebook.com/mena.tn"), "https://web.facebook.com/mena.tn");
  assert.equal(profileUrl("facebook", "https://www.facebook.com/profile.php?id=1000123"), "https://www.facebook.com/profile.php?id=1000123");
  assert.equal(profileUrl("facebook", "https://www.facebook.com/sharer/sharer.php?u=x"), "");
  assert.equal(profileUrl("tiktok", "https://www.tiktok.com/@mena.tn"), "https://www.tiktok.com/@mena.tn");
  assert.equal(profileUrl("tiktok", "https://www.tiktok.com/"), "");
  assert.equal(profileUrl("tiktok", "javascript:alert(1)"), "");
});

test("Messenger needs the page's real username", () => {
  assert.equal(messengerUser("Mena"), "");
  assert.equal(messengerUser("mena.tn"), "mena.tn");
  assert.equal(messengerUser("https://m.me/mena.tn"), "mena.tn");
  assert.equal(messengerUser("https://www.facebook.com/mena.tn"), "mena.tn");
  assert.equal(messengerUser(""), "");
});

test("the back office says what to type", () => {
  assert.equal(socialProblem("instagram", ""), null);
  assert.match(socialProblem("instagram", "https://www.instagram.com/")!, /adresse de votre profil/);
  assert.match(socialProblem("messenger", "Mena")!, /au moins 5/);
  assert.equal(socialProblem("facebook", "https://www.facebook.com/mena.tn"), null);
});
