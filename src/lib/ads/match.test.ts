import { test } from "node:test";
import assert from "node:assert/strict";
import { adSource, isPaidLink, normName, normSource, parseRowKey, rowKey, spendSource } from "./match";

test("names and sources are matched trimmed, lowercased, aliases folded", () => {
  assert.equal(normName("  Lampe-Oct\t"), "lampe-oct");
  assert.equal(normName(" "), null);
  assert.equal(normSource(" FB "), "facebook");
  assert.equal(normSource("IG"), "instagram");
  assert.equal(normSource(null), "direct");
  assert.equal(rowKey("ad", "Facebook", "Lampe|Oct", "Video-1"), "facebook|lampe%7Coct|video-1");
  assert.deepEqual(parseRowKey("facebook|lampe%7Coct|video-1"), { level: "ad", source: "facebook", campaign: "lampe|oct", ad: "video-1" });
});

test("an ad link: a paid medium, or a campaign without an organic medium", () => {
  assert.equal(isPaidLink("paid", null), true);
  assert.equal(isPaidLink(" CPC ", null), true);
  assert.equal(isPaidLink("paid_or_social", null), true, "a click id without utm");
  assert.equal(isPaidLink(null, "lampe-oct"), true);
  assert.equal(isPaidLink("unknown", "lampe-oct"), true, "utm_source and utm_campaign without utm_medium");
  assert.equal(isPaidLink("influencer", "collab-oct"), true);
  assert.equal(isPaidLink("social", "bio"), false, "a bio link tagged by hand");
  assert.equal(isPaidLink("Social", null), false);
  assert.equal(isPaidLink(null, null), false);
  assert.equal(isPaidLink("email", "newsletter-oct"), false);
});

test("the ad traffic of every Meta app counts for facebook, where the Meta export's spend is", () => {
  // {{site_source_name}} gives fb, ig, msg or an depending on where the ad was tapped.
  for (const s of ["fb", "ig", "msg", "an", "instagram", "Instagram", "messenger", "threads"]) {
    assert.equal(adSource(s, "paid", "{{campaign.name}}"), "facebook", s);
  }
  assert.equal(adSource("ig", "cpc", null), "facebook");
  assert.equal(adSource("instagram", null, "lampe-oct"), "facebook", "a campaign without medium");
  assert.equal(adSource("instagram", "unknown", "lampe-oct"), "facebook");
  // Any ad link from Instagram counts with Meta, as spend typed under instagram does: the two always meet.
  assert.equal(adSource("instagram", "influencer", "collab-oct"), "facebook");
  assert.equal(adSource("instagram", "influencer", "collab-oct"), spendSource("instagram"));
});

test("organic Instagram stays apart from Meta's paid row", () => {
  assert.equal(adSource("instagram", "social", null), "instagram", "the site's own referrer visit");
  assert.equal(adSource("instagram", "social", "bio"), "instagram", "a bio link tagged by hand");
  assert.equal(adSource("ig", "bio", "linktree"), "instagram");
  assert.equal(adSource("instagram", null, null), "instagram", "no utm at all");
  // Facebook stays facebook, other platforms are untouched.
  assert.equal(adSource("facebook", "social", null), "facebook");
  assert.equal(adSource("tiktok", "paid", "x"), "tiktok");
  assert.equal(adSource("TT", "paid", "x"), "tiktok");
  assert.equal(adSource(null, null, null), "direct");
});

test("spend is always an ad's: spend under a Meta app is the Meta account's", () => {
  assert.equal(spendSource("instagram"), "facebook");
  assert.equal(spendSource(" IG "), "facebook");
  assert.equal(spendSource("meta"), "facebook");
  assert.equal(spendSource("tiktok"), "tiktok");
  assert.equal(spendSource("snapchat"), "snapchat");
});
