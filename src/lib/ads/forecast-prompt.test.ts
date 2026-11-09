import { test } from "node:test";
import assert from "node:assert/strict";
import { benchRequest, pickRanges, readBenchReply, readReviewReply, toBenchmarks, type BenchAnswer } from "./forecast-prompt";

const fig = (o: Partial<BenchAnswer["figures"][number]>): BenchAnswer["figures"][number] => ({
  metric: "ctr",
  low: 1,
  high: 2,
  unit: "percent",
  market: "mena",
  period: "2025",
  url: "https://example.org/ctr",
  title: "CTR",
  quote: "CTR between 1% and 2%",
  note: "",
  ...o,
});

test("rates become shares, money becomes millimes through a rate with its own page", () => {
  const a: BenchAnswer = {
    figures: [fig({}), fig({ metric: "cpm", low: 1, high: 2, unit: "USD", url: "https://example.org/cpm" }), fig({ metric: "cpm", unit: "EUR", url: "https://example.org/cpm-eur" })],
    fx: [{ currency: "USD", tndPerUnit: 3.1, url: "https://bct.gov.tn/rate", quote: "1 USD = 3,1 TND", date: "2026-11-01" }],
  };
  const list = toBenchmarks(a, null);
  assert.equal(list.length, 2, "the EUR figure has no rate: left out");
  assert.deepEqual([list[0].low, list[0].high], [0.01, 0.02]);
  assert.deepEqual([list[1].low, list[1].high], [3_100, 6_200]);
  assert.match(list[1].converted!, /USD/);
});

test("a pasted reply is never checked; with the API, only pages Claude's tools returned are", () => {
  const a: BenchAnswer = { figures: [fig({}), fig({ url: "https://made-up.example/x" })], fx: [] };
  assert.deepEqual(toBenchmarks(a, null).map((b) => [b.checked, b.used]), [[false, false], [false, false]]);
  const api = toBenchmarks(a, new Set(["https://www.example.org/ctr/"]));
  assert.deepEqual(api.map((b) => [b.checked, b.used]), [[true, true], [false, false]]);
});

test("a USD figure is not converted with a rate whose page Claude never opened", () => {
  const a: BenchAnswer = { figures: [fig({ metric: "cpm", unit: "USD" })], fx: [{ currency: "USD", tndPerUnit: 3.1, url: "https://rate.example/x", quote: "", date: "" }] };
  assert.equal(toBenchmarks(a, new Set(["https://example.org/ctr"])).length, 0);
});

test("figures that cannot be a share or a price are left out", () => {
  const a: BenchAnswer = { figures: [fig({ high: 140 }), fig({ unit: "TND" }), fig({ metric: "cpm", unit: "percent" }), fig({ metric: "learningEvents", unit: "events", low: 50, high: 50 })], fx: [] };
  const list = toBenchmarks(a, null);
  assert.deepEqual(list.map((b) => b.metric), ["learningEvents"]);
});

test("the most local market wins, and its sources make one wide range", () => {
  const list = toBenchmarks(
    {
      figures: [fig({ market: "global", low: 0.9, high: 1.2 }), fig({ market: "maghreb", low: 1.1, high: 1.5, url: "https://a.example" }), fig({ market: "maghreb", low: 1.4, high: 2.2, url: "https://b.example" }), fig({ market: "tunisia", low: 3, high: 3, url: "https://c.example" })],
      fx: [],
    },
    null,
  ).map((b) => ({ ...b, used: b.market !== "tunisia" }));
  const p = pickRanges(list);
  assert.equal(p.ctr!.market, "maghreb");
  assert.ok(Math.abs(p.ctr!.range.low - 0.011) < 1e-12 && Math.abs(p.ctr!.range.high - 0.022) < 1e-12);
  assert.equal(p.ctr!.sources.length, 2);
  assert.equal(p.cpm, undefined);
});

test("a pasted reply is read figure by figure, and the request asks for the pages", () => {
  const reply = "Voici :\n```json\n" + JSON.stringify({ figures: [fig({}), { metric: "ctr", low: "x" }], fx: [] }) + "\n```";
  assert.equal(readBenchReply(reply)!.figures.length, 1);
  assert.equal(readBenchReply("pas de json"), null);
  // Only web pages become links.
  assert.equal(readBenchReply(JSON.stringify({ figures: [fig({ url: "javascript:alert(1)" }), fig({ url: "data:text/html,x" })], fx: [] }))!.figures.length, 0);
  assert.match(benchRequest(), /exact sentence/);
});

const review = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  verdict: "launch",
  angle: "démo",
  scores: Object.fromEntries(["hook", "clarity", "proof", "offer", "match", "format"].map((k) => [k, { score: 4, why: "ok" }])),
  ctrFactor: 1.2,
  convFactor: 1,
  confidence: "medium",
  risks: [],
  fixes: [],
  placements: ["reels"],
  ...o,
});

test("a review keeps only the ads sent, once each, with factors held to their range", () => {
  const reply = JSON.stringify({
    creatives: [review("C1", { ctrFactor: 4 }), review("C1"), review("C9"), review("C2", { convFactor: 0.1, scores: { hook: { score: 4.6, why: "" } } }), review("C3", { convFactor: 0.1 })],
    grouping: [["C1", "C9", "C3", "C3"]],
    groupingWhy: "même angle",
    summary: "ok",
  });
  const r = readReviewReply(reply, ["C1", "C2", "C3"])!;
  assert.deepEqual(r.creatives.map((c) => c.id), ["C1", "C3"], "C2's scores are incomplete, C9 was never sent");
  assert.equal(r.creatives[0].ctrFactor, 1.6);
  assert.equal(r.creatives[1].convFactor, 0.5);
  assert.deepEqual(r.grouping, [["C1", "C3"]]);
  assert.equal(readReviewReply(JSON.stringify({ creatives: [review("X")] }), ["C1"]), null);
});
