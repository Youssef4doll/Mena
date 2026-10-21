import { test } from "node:test";
import assert from "node:assert/strict";
import { href } from "../../i18n/lang";
import { normName } from "./match";
import { buildAdLink, cleanName, shortSlug, suggestAdName, suggestCampaign, type LinkInput } from "./utm";

const SITE = "https://mena.tn/";
const base: LinkInput = { site: SITE, slug: "lampe-chevet", lang: "ar", platform: "meta" };
/** What the site's attribution reads from the link (src/lib/client/attribution.ts), before matching. */
const read = (url: string) => new URL(url).searchParams;

test("Meta: every name comes from Meta's macros, left unencoded so Meta replaces them", () => {
  const l = buildAdLink(base);
  assert.equal(l.ok, true);
  assert.equal(l.params, "utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}");
  assert.equal(l.url, `https://mena.tn${href("ar", "/produit/lampe-chevet")}?${l.params}`);
  assert.deepEqual(l.macros, ["campaign", "adSet", "ad"]);
  assert.ok(l.checks.every((c) => c.level === "info"));
});

test("TikTok: its own macros (AID is the ad group, CID the ad), and the French page under its prefix", () => {
  const l = buildAdLink({ ...base, platform: "tiktok", lang: "fr" });
  assert.equal(l.values.source, "tiktok");
  assert.equal(l.values.campaign, "__CAMPAIGN_NAME__");
  assert.equal(l.values.adSet, "__AID_NAME__");
  assert.equal(l.values.ad, "__CID_NAME__");
  assert.ok(l.url.startsWith(`https://mena.tn${href("fr", "/produit/lampe-chevet")}?utm_source=tiktok&utm_medium=paid&`));
});

test("typed names are cleaned, and a change that breaks the match with Ads Manager is said", () => {
  const l = buildAdLink({ ...base, campaign: "  Lampe  Oct ", ad: "Vidéo 1" });
  assert.equal(l.values.campaign, "lampe-oct");
  assert.equal(l.values.ad, "vidéo-1");
  // The ad set was left empty: Meta still fills it.
  assert.deepEqual(l.macros, ["adSet"]);
  const p = read(l.url);
  assert.equal(normName(p.get("utm_campaign")), "lampe-oct");
  assert.equal(normName(p.get("utm_content")), "vidéo-1");
  const warnings = l.checks.filter((c) => c.level === "warning");
  assert.deepEqual(warnings.map((c) => c.field), ["campaign", "ad"]);
  assert.match(warnings[0].message, /« lampe-oct »/);
});

test("case alone is no warning: matching ignores it", () => {
  const l = buildAdLink({ ...base, campaign: "Lampe-Oct" });
  assert.equal(l.values.campaign, "lampe-oct");
  assert.equal(l.checks.filter((c) => c.level !== "info").length, 0);
});

test("a name the site would cut blocks the link", () => {
  const l = buildAdLink({ ...base, ad: "x".repeat(121) });
  assert.equal(l.ok, false);
  assert.equal(l.url, "");
  assert.equal(l.params, "");
  assert.ok(l.checks.some((c) => c.field === "ad" && c.level === "error" && /121 caractères/.test(c.message)));
});

test("another platform's macro is refused; the platform's own is kept as is", () => {
  const wrong = buildAdLink({ ...base, platform: "tiktok", ad: "{{ad.name}}" });
  assert.equal(wrong.ok, false);
  assert.match(wrong.checks.find((c) => c.level === "error")!.message, /TikTok/);
  const own = buildAdLink({ ...base, ad: "{{ad.name}}" });
  assert.equal(own.ok, true);
  assert.ok(own.params.endsWith("utm_content={{ad.name}}"));
});

test("names already in use: the same one joins it, a near-duplicate is flagged", () => {
  const known = { campaigns: ["Lampe-Oct"], ads: ["demo-v1"] };
  const same = buildAdLink({ ...base, campaign: "lampe-oct", known });
  assert.ok(same.checks.some((c) => c.level === "info" && /déjà utilisé/.test(c.message)));
  const near = buildAdLink({ ...base, campaign: "lampe_oct", ad: "Démo V1", known });
  const flagged = near.checks.filter((c) => c.level === "warning" && /Très proche/.test(c.message)).map((c) => c.field);
  assert.deepEqual(flagged, ["campaign", "ad"]);
});

test("other sources: the source is required and checked, names are encoded, gaps are said", () => {
  assert.equal(buildAdLink({ ...base, platform: "other" }).ok, false);
  assert.equal(buildAdLink({ ...base, platform: "other", source: "mon influenceur" }).ok, false);
  const snap = buildAdLink({ ...base, platform: "other", source: "Snapchat", campaign: "promo&co" });
  assert.equal(snap.ok, true);
  assert.deepEqual(snap.macros, []);
  assert.ok(snap.params.startsWith("utm_source=snapchat&utm_medium=paid&utm_campaign=promo%26co"));
  assert.equal(read(snap.url).get("utm_campaign"), "promo&co");
  assert.ok(!snap.params.includes("utm_content"));
  assert.ok(snap.checks.some((c) => c.field === "ad" && c.level === "info"));
  assert.ok(buildAdLink({ ...base, platform: "other", source: "snapchat" }).checks.some((c) => c.field === "campaign" && c.level === "warning"));
  // "fb" is Facebook for the matching: Meta's macros would do better.
  const fb = buildAdLink({ ...base, platform: "other", source: "fb", campaign: "x" });
  assert.equal(fb.values.source, "facebook");
  assert.ok(fb.checks.some((c) => c.field === "source" && c.level === "warning"));
  // An Instagram ad is a Meta ad: the link should be Meta's, written facebook.
  const ig = buildAdLink({ ...base, platform: "other", source: "Instagram", campaign: "x" });
  assert.ok(ig.checks.some((c) => c.field === "source" && c.level === "warning" && c.message.includes("plateforme Meta")));
  assert.ok(!buildAdLink({ ...base, platform: "other", source: "influenceur", campaign: "x" }).checks.some((c) => c.field === "source"));
});

test("names suggested for a product", () => {
  assert.equal(cleanName(" Promo  Été -- 2 "), "promo-été-2");
  assert.equal(shortSlug("diffuseur-huiles-essentielles"), "diffuseur-huiles");
  assert.equal(suggestAdName("diffuseur-huiles-essentielles", "demo"), "diffuseur-huiles-demo-v1");
  assert.equal(suggestAdName("lampe", "offer", 3), "lampe-offer-v3");
  assert.equal(suggestCampaign("lampe-chevet", "2026-10-19"), "lampe-chevet-2026-10");
});
