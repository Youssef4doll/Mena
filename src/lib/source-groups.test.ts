import { test } from "node:test";
import assert from "node:assert/strict";
import { bestSource, groupSources } from "./source-groups";

test("fb, facebook, ig and instagram are counted as two platforms, as the ads matching does", () => {
  const rows = [
    { source: "fb", campaign: null, sessions: 120, orders: 0 },
    { source: "facebook", campaign: null, sessions: 10, orders: 1 },
    { source: "ig", campaign: null, sessions: 60, orders: 0 },
    { source: "Instagram", campaign: null, sessions: 5, orders: 0 },
    { source: "direct", campaign: null, sessions: 7, orders: 2 },
  ];
  assert.deepEqual(groupSources(rows, ["sessions", "orders"]), [
    { source: "facebook", campaign: null, sessions: 130, orders: 1 },
    { source: "instagram", campaign: null, sessions: 65, orders: 0 },
    { source: "direct", campaign: null, sessions: 7, orders: 2 },
  ]);
});

test("campaigns of the same platform stay apart", () => {
  const rows = [
    { source: "fb", campaign: "120257663296270091", sessions: 3 },
    { source: "facebook", campaign: "120257663296270091", sessions: 2 },
    { source: "fb", campaign: "autre", sessions: 1 },
  ];
  assert.deepEqual(groupSources(rows, ["sessions"]).map((r) => [r.campaign, r.sessions]), [["120257663296270091", 5], ["autre", 1]]);
});

test("a best source is named only when it has orders", () => {
  assert.equal(bestSource([{ source: "facebook", sessions: 180, orders: 0 }, { source: "instagram", sessions: 60, orders: 0 }]), null);
  assert.equal(bestSource([{ source: "facebook", sessions: 180, orders: 2 }, { source: "instagram", sessions: 60, orders: 0 }])?.source, "facebook");
  // Too few visits to compare: nothing said.
  assert.equal(bestSource([{ source: "facebook", sessions: 180, orders: 2 }, { source: "direct", sessions: 10, orders: 1 }]), null);
});
