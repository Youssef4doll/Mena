import { test } from "node:test";
import assert from "node:assert/strict";
import { isPale, readHex } from "./color";

test("reads colour codes typed in any common way", () => {
  assert.equal(readHex("#1F2937"), "#1f2937");
  assert.equal(readHex(" 1f2937 "), "#1f2937");
  assert.equal(readHex("#fff"), "#ffffff");
  assert.equal(readHex("bleu"), null);
  assert.equal(readHex("#12345"), null);
});

test("a white or cream dot gets a ring, a dark one does not", () => {
  assert.equal(isPale("#ffffff"), true);
  assert.equal(isPale("#f5f0e1"), true);
  assert.equal(isPale("#1f2937"), false);
  assert.equal(isPale("#e11d48"), false);
});
