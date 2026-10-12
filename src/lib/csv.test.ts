import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv, dt } from "./csv";

test("csv escapes quotes, commas and formulas", () => {
  const out = toCsv(["a", "b"], [["x,y", 'say "hi"'], ["=1+1", -5]]);
  assert.equal(out, '﻿a,b\r\n"x,y","say ""hi"""\r\n\'=1+1,-5');
});

test("dinars with three decimals", () => {
  assert.equal(dt(89_900), "89.900");
  assert.equal(dt(null), "");
});
