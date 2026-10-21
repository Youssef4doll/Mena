import { test } from "node:test";
import assert from "node:assert/strict";
import { dayShares, importKeyText, planImport, readPlatformExport, type SavedSpend } from "./platform-csv";
import { spendInRange } from "../profit";
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
  assert.deepEqual(r.rows[0], { day: "2026-10-01", days: 1, source: "facebook", campaign: "Lampe Oct", adSet: "Large 18-45", ad: "Video 1", account: null, amount: 85_500, impressions: 5200, clicks: 120, reach: 3000, purchases: 4, line: 3, lines: 1 });
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

test("the ad account is part of the import key when the export has it; older files keep their keys", () => {
  const csv = [
    "Account ID,Account name,Campaign name,Ad name,Day,Amount spent (TND)",
    "1111,Boutique,Lampe,V1,2026-10-12,10",
    "2222,Boutique 2,Lampe,V1,2026-10-12,4",
    "2222,Boutique 2,Lampe,V1,2026-10-12,1",
  ].join("\n");
  const r = readPlatformExport(csv);
  assert.deepEqual(r.rows.map((x) => [x.account, x.amount, x.lines]), [["1111", 10_000, 1], ["2222", 5_000, 2]], "two accounts stay two rows; one account's lines are added up");
  assert.notEqual(importKeyText(r.rows[0]), importKeyText(r.rows[1]));

  // The key every import made before the account was read: re-importing an old file must still find its rows.
  const old = readPlatformExport("Campaign name,Ad name,Day,Amount spent (TND)\nLampe,V1,2026-10-12,10").rows[0];
  assert.equal(old.account, null);
  assert.equal(importKeyText(old), JSON.stringify(["facebook", "lampe", null, "v1", "2026-10-12", 1]));
  assert.equal(importKeyText({ ...old, account: "1111" }), JSON.stringify(["facebook", "lampe", null, "v1", "2026-10-12", 1, "1111"]));
  assert.equal(importKeyText({ ...old, campaign: " LAMPE ", account: "  " }), importKeyText(old), "case, spaces and a blank account do not change the key");

  const fr = readPlatformExport("Nom du compte;Nom de la campagne;Jour;Montant dépensé (TND)\nMa Boutique;Lampe;12/10/2026;10");
  assert.equal(fr.rows[0].account, "Ma Boutique", "the name when there is no ID");
  const tt = readPlatformExport("Advertiser ID,Advertiser name,Campaign name,Date,Cost (TND)\n7001,Mena,ugc,2026-10-12,3");
  assert.equal(tt.rows[0].account, "7001");
  assert.equal(tt.columns.accountId, "Advertiser ID");
});

const saved = (id: string, day: string, days: number, campaign: string | null, more: Partial<SavedSpend> = {}): SavedSpend => ({ id, day, days, source: "facebook", campaign, adSet: null, ad: null, imported: true, ...more });
const row = (day: string, days: number, campaign: string | null, ad: string | null = null) => ({ day, days, source: "facebook", campaign, adSet: null, ad });

test("a newer export replaces the earlier import of the same campaign and days, whatever its grain", () => {
  // Campaign totals first, then the same day by ad.
  const byAd = [row("2026-10-12", 1, "Lampe", "V1"), row("2026-10-12", 1, "lampe", "V2")];
  assert.deepEqual(planImport(byAd, [saved("a", "2026-10-12", 1, "Lampe")]), { replaced: ["a"], overlaps: { imported: 0, typed: 0 } });

  // Seven daily rows, then one weekly total (and back).
  const week = Array.from({ length: 7 }, (_, i) => saved(`d${i}`, `2026-10-0${i + 1}`, 1, "Lampe"));
  assert.deepEqual(planImport([row("2026-10-01", 7, "Lampe")], week).replaced, ["d0", "d1", "d2", "d3", "d4", "d5", "d6"]);
  const daily = Array.from({ length: 7 }, (_, i) => row(`2026-10-0${i + 1}`, 1, "Lampe"));
  assert.deepEqual(planImport(daily, [saved("w", "2026-10-01", 7, "Lampe")]).replaced, ["w"], "days covered by several rows of the file count together");

  // Another campaign, another source, or rows typed by hand: untouched.
  const others = [saved("x", "2026-10-12", 1, "Autre"), saved("t", "2026-10-12", 1, "Lampe", { source: "tiktok" }), saved("h", "2026-10-12", 1, "Lampe", { imported: false })];
  assert.deepEqual(planImport(byAd, others), { replaced: [], overlaps: { imported: 0, typed: 1 } });
});

test("an earlier import only partly in the new file is kept and reported; another ad's days are not an overlap", () => {
  const plan = planImport([row("2026-10-05", 1, "Lampe"), row("2026-10-06", 1, "Lampe")], [saved("w", "2026-10-01", 7, "Lampe"), saved("n", "2026-10-06", 1, null)]);
  assert.deepEqual(plan, { replaced: [], overlaps: { imported: 2, typed: 0 } }, "a weekly row with two of its days in the file; a row without a campaign on the same day");

  const plan2 = planImport([row("2026-10-12", 1, "Lampe", "V1")], [saved("v2", "2026-10-11", 3, "Lampe", { ad: "V2" })]);
  assert.deepEqual(plan2, { replaced: [], overlaps: { imported: 0, typed: 0 } });
  const gap = planImport([row("2026-10-01", 1, "Lampe"), row("2026-10-03", 1, "Lampe")], [saved("w", "2026-10-01", 3, "Lampe")]);
  assert.deepEqual(gap, { replaced: [], overlaps: { imported: 1, typed: 0 } }, "a missing day in the file: the earlier row is not fully covered");
});

test("an export filtered to some ads replaces only those ads", () => {
  const byAd = [saved("v1", "2026-10-10", 1, "Lampe", { ad: "Video-1" }), saved("c2", "2026-10-10", 1, "Lampe", { ad: "Carrousel-2" }), saved("c2b", "2026-10-11", 1, "Lampe", { ad: "Carrousel-2" })];
  const file = [row("2026-10-10", 1, "lampe", "video-1"), row("2026-10-11", 1, "Lampe", "Video-1")];
  assert.deepEqual(planImport(file, byAd), { replaced: ["v1"], overlaps: { imported: 0, typed: 0 } }, "Carrousel-2 is not in the file: its spend stays, and does not meet Video-1's");

  // A file without ads is a total of all of them; an ad set the file does not name stays.
  assert.deepEqual(planImport([row("2026-10-10", 1, "Lampe")], byAd).replaced, ["v1", "c2"]);
  const sets = [saved("s1", "2026-10-10", 1, "Lampe", { adSet: "Large" }), saved("s2", "2026-10-10", 1, "Lampe", { adSet: "Femmes 25-45" })];
  assert.deepEqual(planImport([{ ...row("2026-10-10", 1, "Lampe"), adSet: "large" }], sets).replaced, ["s1"]);
});

test("a total spread over days adds up to the period's share of it", () => {
  const sum = (xs: { value: number }[]) => xs.reduce((s, x) => s + x.value, 0);
  const week = { day: "2026-10-05", days: 7 };
  const all = dayShares(12_345, week, "2026-09-21", "2026-10-21");
  assert.deepEqual(all.map((x) => x.value), [1764, 1763, 1764, 1763, 1764, 1763, 1764]);
  assert.deepEqual([all[0].day, all[6].day], ["2026-10-05", "2026-10-11"]);
  assert.equal(sum(all), 12_345);

  // A row cut by the period's edges: the days inside add up to spendInRange, rounded once.
  for (const [from, to] of [["2026-10-07", "2026-10-21"], ["2026-09-21", "2026-10-08"], ["2026-10-06", "2026-10-09"]]) {
    assert.equal(sum(dayShares(12_345, week, from, to)), spendInRange({ ...week, amount: 12_345 }, from, to), `${from} → ${to}`);
  }
  assert.deepEqual(dayShares(2_001, { day: "2026-09-20", days: 2 }, "2026-09-21", "2026-10-21"), [{ day: "2026-09-21", value: 1001 }]);
  assert.deepEqual(dayShares(5, { day: "2026-10-01", days: 1 }, "2026-10-02", "2026-10-21"), [], "a row before the period");
  assert.deepEqual(dayShares(2, { day: "2026-10-01", days: 3 }, "2026-09-21", "2026-10-21").map((x) => x.value), [1, 0, 1]);
  assert.equal(sum(dayShares(1_000_001, { day: "2026-07-01", days: 92 }, "2026-01-01", "2026-12-31")), 1_000_001);
});
