import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetText, chanceText, change, coverage, fixHref, missingItems, rowId, valueText, VERDICTS } from "./format";
import type { AdRow, Funnel } from "@/lib/ads/types";

test("writes each unit the way the back office does; unknown is a dash, never 0", () => {
  assert.equal(valueText(12_400, "money"), "12,400 DT");
  assert.equal(valueText(0.032, "rate"), "3,2 %");
  assert.equal(valueText(2.456, "multiple"), "2,46×");
  assert.equal(valueText(1.84, "number"), "1,8");
  assert.equal(valueText(null, "money"), "—");
  assert.equal(valueText(Number.NaN, "rate"), "—");
});

test("rates change in points, money in percent, and the colour follows what is good", () => {
  assert.deepEqual(change(0.66, 0.6, "rate", "higher"), { text: "▲ 6 pt", tone: "good" });
  assert.deepEqual(change(0.6, 0.66, "rate", "higher"), { text: "▼ 6 pt", tone: "bad" });
  assert.deepEqual(change(12_000, 10_000, "money", "lower"), { text: "▲ 20 %", tone: "bad" }, "a dearer delivered order is bad");
  assert.deepEqual(change(3, 3, "multiple", "higher"), { text: "stable", tone: "neutral" });
  assert.deepEqual(change(2, 1, "number", null), { text: "▲ 100 %", tone: "neutral" }, "frequency: no good direction");
});

test("a loss turning into a profit moves in money, not in a meaningless percentage", () => {
  assert.deepEqual(change(50_000, -100_000, "money", "higher"), { text: "▲ 150,000 DT", tone: "good" });
  assert.deepEqual(change(-20_000, 10_000, "money", "higher"), { text: "▼ 30,000 DT", tone: "bad" });
});

test("no change is shown when a side is unknown or the previous value is 0", () => {
  assert.equal(change(null, 1, "money", "higher"), null);
  assert.equal(change(1, null, "rate", "higher"), null);
  assert.equal(change(5, 0, "number", "higher"), null);
});

test("budget changes read as words; −100 % is a pause", () => {
  assert.equal(budgetText(20), "+20 %");
  assert.equal(budgetText(-30), "−30 %");
  assert.equal(budgetText(-100), "Pause");
  assert.equal(budgetText(0), "Inchangé");
  assert.equal(budgetText(null), "—");
});

test("verdict ranks put what needs action first", () => {
  const order = (Object.keys(VERDICTS) as (keyof typeof VERDICTS)[]).sort((a, b) => VERDICTS[a].rank - VERDICTS[b].rank);
  assert.deepEqual(order, ["cut", "tracking", "fix", "wait", "keep", "scale"]);
});

test("missing inputs come once each, money first, with where to give them", () => {
  const items = missingItems(["reach", "carrierCost", "spend", "carrierCost", "baseline"]);
  assert.deepEqual(items.map((i) => i.input), ["spend", "carrierCost", "reach", "baseline"]);
  assert.equal(items[1].fix, "costs");
  assert.equal(items[3].fix, null, "the shop's rates need no action");
});

test("fix links keep the period inside the ads section only", () => {
  assert.equal(fixHref("links", "p=7"), "/admin/publicites/idees?p=7#liens");
  assert.equal(fixHref("import", "p=7"), "/admin/publicites/importer?p=7");
  assert.equal(fixHref("costs", "p=7"), "/admin/parametres");
  assert.equal(fixHref("brief"), "/admin/publicites/idees");
});

test("tagging coverage counts the orders that carry a source", () => {
  const f = (orders: number) => ({ orders }) as Funnel;
  const row = (source: string, orders: number) => ({ source, funnel: f(orders) }) as AdRow;
  assert.deepEqual(coverage([row("facebook", 6), row("direct", 4), row("tiktok", 2)]), { orders: 12, tagged: 8 });
});

test("row ids are safe after a #", () => {
  assert.equal(rowId("facebook|Lampe Été|vidéo-1"), "r-facebook-lampe-ete-video-1");
});

test("a probability never reads as a certainty", () => {
  assert.equal(chanceText(0.724), "72 %");
  assert.equal(chanceText(0.999), "plus de 99 %");
  assert.equal(chanceText(0.001), "moins de 1 %");
  assert.equal(chanceText(null), "—");
});
