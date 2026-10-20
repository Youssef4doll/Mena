import { test } from "node:test";
import assert from "node:assert/strict";
import { readPlatformExport } from "./platform-csv";
import { normName, normSource, parseRowKey, rowKey } from "./match";

// Ads Manager's English CSV as downloaded: BOM, every cell quoted, the summary row first.
const META_EN = [
  '﻿"Reporting starts","Reporting ends","Campaign name","Ad set name","Ad name","Day","Delivery status","Reach","Impressions","Frequency","Result indicator","Results","Amount spent (TND)","Cost per result","Clicks (all)","Link clicks","Purchases"',
  '"2026-10-01","2026-10-02","","","","","","9100","16500","1.81","","","1,234.560","","700","460","9"',
  '"2026-10-01","2026-10-02","Lampe Oct","Large 18-45","Video 1","2026-10-01","active","3000","5200","1.73","actions:offsite_conversion.fb_pixel_purchase","4","85.5","21.375","300","120","4"',
  '"2026-10-01","2026-10-02","Lampe Oct","Large 18-45","Video 1","2026-10-02","active","3500","6300","1.8","actions:offsite_conversion.fb_pixel_purchase","3","1,049.06","349.687","400","340",""',
].join("\r\n");

test("reads Meta's English export: BOM, quotes, summary row, thousands and decimals", () => {
  const r = readPlatformExport(META_EN);
  assert.equal(r.error, undefined);
  assert.equal(r.platform, "meta");
  assert.equal(r.source, "facebook");
  assert.equal(r.currency, "TND");
  assert.deepEqual(r.skipped, [{ line: 2, reason: "Ligne de total (sans nom de campagne)" }]);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0], { day: "2026-10-01", days: 1, source: "facebook", campaign: "Lampe Oct", adSet: "Large 18-45", ad: "Video 1", amount: 85_500, impressions: 5200, clicks: 120, reach: 3000, purchases: 4, line: 3, lines: 1 });
  assert.equal(r.rows[1].amount, 1_049_060);
  assert.equal(r.rows[1].clicks, 340, "link clicks, not all clicks");
  assert.equal(r.rows[1].purchases, 0, "Meta leaves zeros blank");
  assert.deepEqual(r.total, { amount: 1_134_560, from: "2026-10-01", to: "2026-10-02" });
  assert.equal(r.columns.clicks, "Link clicks");
});

test("reads Meta's French export saved again by Excel: semicolons, « 1 234,56 », day-first dates", () => {
  const csv = [
    "Début des rapports;Fin des rapports;Nom de la campagne;Nom de l’ensemble de publicités;Nom de la publicité;Jour;Couverture;Impressions;Indicateur de résultat;Résultats;Montant dépensé (TND);Clics sur un lien;Achats",
    '01/10/2026;31/10/2026;Lampe Oct;Large;Vidéo 1;13/10/2026;"1 234";"5 200";actions:offsite_conversion.fb_pixel_purchase;4;"1 234,56";1,234;',
    "01/10/2026;31/10/2026;Lampe Oct;Large;Vidéo 2;13/10/2026;800;1500;;;12.500;40;1",
  ].join("\n");
  const r = readPlatformExport(csv);
  assert.equal(r.error, undefined);
  assert.equal(r.platform, "meta");
  const [a, b] = r.rows;
  assert.equal(a.day, "2026-10-13");
  assert.equal(a.days, 1, "the Day column wins over the report's start and end");
  assert.equal(a.amount, 1_234_560);
  assert.equal(a.reach, 1234);
  assert.equal(a.impressions, 5200);
  assert.equal(a.clicks, 1234, "a count is never one and a bit");
  assert.equal(a.purchases, 0);
  assert.equal(b.amount, 12_500, "a French file never groups thousands with a dot: 12.500 is twelve and a half");
  assert.equal(b.purchases, 1);
});

test("reads a TikTok export: separate currency column, Cost, destination clicks, total row, dashes", () => {
  const csv = [
    "Campaign name,Ad group name,Ad name,Date,Currency,Cost,Impressions,Clicks (destination),Reach,Complete payment",
    "ugc-lampe,Broad,hook-1,2026-10-12 00:00:00,TND,45.250,8000,150,6000,3",
    'ugc-lampe,Broad,hook-1,2026-10-13 00:00:00,TND,"1,045.250","9,000",160,6500,-',
    'Total of 2 ads,-,-,-,TND,"1,090.500","17,000",310,12500,3',
  ].join("\n");
  const r = readPlatformExport(csv);
  assert.equal(r.error, undefined);
  assert.equal(r.platform, "tiktok");
  assert.equal(r.source, "tiktok");
  assert.equal(r.currency, "TND");
  assert.deepEqual(r.skipped, [{ line: 4, reason: "Ligne de total" }]);
  assert.deepEqual(
    r.rows.map((x) => [x.day, x.campaign, x.adSet, x.ad, x.amount, x.impressions, x.clicks, x.reach, x.purchases]),
    [
      ["2026-10-12", "ugc-lampe", "Broad", "hook-1", 45_250, 8000, 150, 6000, 3],
      ["2026-10-13", "ugc-lampe", "Broad", "hook-1", 1_045_250, 9000, 160, 6500, null],
    ],
  );
});

test("reads TikTok's French columns", () => {
  const csv = "Nom de la campagne;Nom du groupe d'annonces;Nom de l'annonce;Date;Coût (TND);Impressions;Clics (destination);Couverture;Paiement effectué\nugc;Large;hook-2;2026-10-12;30,5;1000;20;900;1";
  const r = readPlatformExport(csv);
  assert.equal(r.platform, "tiktok");
  assert.deepEqual([r.rows[0].amount, r.rows[0].adSet, r.rows[0].purchases], [30_500, "Large", 1]);
});

test("a weekly row covers its days; a period over 92 days is refused", () => {
  const csv = "Reporting starts,Reporting ends,Campaign name,Amount spent (TND),Impressions\n2026-10-01,2026-10-07,Lampe,70,7000\n2026-01-01,2026-12-31,Lampe,700,70000";
  const r = readPlatformExport(csv);
  assert.deepEqual([r.rows[0].day, r.rows[0].days, r.rows[0].amount], ["2026-10-01", 7, 70_000]);
  assert.equal(r.rows[0].clicks, null, "no clicks column: not given");
  assert.equal(r.skipped.length, 1);
  assert.match(r.skipped[0].reason, /92 jours/);
});

test("adds up the lines of an export broken down by age, and says so", () => {
  const csv = [
    "Campaign name,Ad name,Age,Day,Amount spent (TND),Impressions,Link clicks,Reach",
    "Lampe,V1,18-24,2026-10-12,10,1000,10,800",
    "Lampe,V1,25-34,2026-10-12,15.5,2000,25,1500",
    "Lampe,V1,25-34,2026-10-13,5,500,5,400",
  ].join("\n");
  const r = readPlatformExport(csv);
  assert.equal(r.rows.length, 2);
  assert.deepEqual([r.rows[0].amount, r.rows[0].impressions, r.rows[0].clicks, r.rows[0].lines], [25_500, 3000, 35, 2]);
  assert.ok(r.warnings.some((w) => w.includes("additionnées")));
});

test("month-first dates are recognised when the file shows them", () => {
  const csv = "Campaign name,Day,Amount spent (TND)\nA,10/13/2026,5\nA,10/14/2026,5";
  assert.deepEqual(readPlatformExport(csv).rows.map((r) => r.day), ["2026-10-13", "2026-10-14"]);
  const fr = readPlatformExport("Nom de la campagne;Jour;Montant dépensé (TND)\nA;05/10/2026;5");
  assert.equal(fr.rows[0].day, "2026-10-05");
  assert.ok(fr.warnings.some((w) => w.includes("jour/mois")));
});

test("results count as purchases only where the result indicator says purchase", () => {
  const csv = [
    "Campaign name,Day,Result indicator,Results,Amount spent (TND)",
    "Achat,2026-10-12,actions:offsite_conversion.fb_pixel_purchase,4,10",
    "Messages,2026-10-12,actions:onsite_conversion.messaging_conversation_started_7d,30,10",
  ].join("\n");
  const r = readPlatformExport(csv);
  assert.deepEqual(r.rows.map((x) => x.purchases), [4, null]);
  const bare = readPlatformExport("Campaign name,Day,Results,Amount spent (TND)\nA,2026-10-12,30,10");
  assert.equal(bare.rows[0].purchases, null);
  assert.ok(bare.warnings.some((w) => w.includes("Résultats")));
});

test("refuses a file whose currency is unknown, and converts a foreign one at the owner's rate", () => {
  const noCurrency = "Campaign name,Day,Amount spent,Impressions\nA,2026-10-12,10,100";
  const a = readPlatformExport(noCurrency);
  assert.equal(a.needs, "currency");
  assert.equal(a.rows.length, 0);
  assert.equal(readPlatformExport(noCurrency, { currency: "TND" }).rows[0].amount, 10_000);

  const usd = "Campaign name,Day,Amount spent (USD)\nA,2026-10-12,10.5";
  assert.equal(readPlatformExport(usd).needs, "rate");
  const b = readPlatformExport(usd, { rate: 3.1 });
  assert.equal(b.rows[0].amount, 32_550);
  assert.ok(b.warnings.some((w) => w.includes("3,1 DT")));

  assert.match(readPlatformExport("Campaign name,Day,Currency,Cost\nA,2026-10-12,USD,1\nB,2026-10-12,EUR,1", { rate: 3 }).error ?? "", /Plusieurs devises/);
});

test("refuses a file without a spend column or a date, and skips unreadable or empty rows", () => {
  assert.match(readPlatformExport("Campaign name,Impressions\nA,100").error ?? "", /dépense/);
  assert.match(readPlatformExport("Campaign name,Amount spent (TND)\nA,10").error ?? "", /date/);
  const r = readPlatformExport("Campaign name,Day,Amount spent (TND)\nA,2026-10-12,abc\nB,2026-10-12,0\nC,2026-13-40,4\nD,2026-10-12,");
  assert.deepEqual(r.skipped.map((s) => s.reason.split(" :")[0]), ["Montant illisible", "Aucune dépense", "Date illisible", "Aucune dépense"]);
  assert.match(r.error ?? "", /Aucune ligne/);
});

test("an unknown platform needs a source; a given source wins", () => {
  const csv = "Campaign name,Day,Spend (TND)\nA,2026-10-12,10";
  assert.equal(readPlatformExport(csv).needs, "source");
  assert.equal(readPlatformExport(csv, { source: "Instagram" }).rows[0].source, "instagram");
  assert.equal(readPlatformExport(META_EN, { source: "ig" }).source, "instagram");
});

test("names are cut where the site cuts utm values, so they still match", () => {
  const long = "x".repeat(150);
  const r = readPlatformExport(`Campaign name,Day,Amount spent (TND)\n${long},2026-10-12,1`);
  assert.equal(r.rows[0].campaign?.length, 120);
});

test("matching: case and spaces around names do not matter, aliases give the same source", () => {
  assert.equal(normName("  Lampe-Oct \t"), "lampe-oct");
  assert.equal(normName("  "), null);
  assert.equal(normSource("FB"), "facebook");
  assert.equal(normSource(null), "direct");
  assert.equal(rowKey("ad", "Facebook", "Lampe Oct", "Video 1"), "facebook|lampe oct|video 1");
  assert.equal(rowKey("campaign", "tiktok", null), "tiktok|");
  assert.equal(rowKey("source", "tiktok", "ignored"), "tiktok");
});

test("a key survives names that contain the separator", () => {
  const key = rowKey("ad", "facebook", "Lampe | Oct", "50%|off");
  assert.deepEqual(parseRowKey(key), { level: "ad", source: "facebook", campaign: "lampe | oct", ad: "50%|off" });
  assert.deepEqual(parseRowKey("facebook||video-1"), { level: "ad", source: "facebook", campaign: null, ad: "video-1" });
  assert.deepEqual(parseRowKey("facebook"), { level: "source", source: "facebook", campaign: null, ad: null });
});
