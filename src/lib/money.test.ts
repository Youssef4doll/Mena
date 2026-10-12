import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTND, parseTND } from "./money";

test("formats millimes with three decimals", () => {
  assert.equal(formatTND(89_900), "89,900 DT");
  assert.equal(formatTND(1_250_500), "1 250,500 DT");
  assert.equal(formatTND(0), "0,000 DT");
  assert.equal(formatTND(7_000, "ar"), "7,000 د.ت");
});

test("parses back-office input", () => {
  assert.equal(parseTND("89,9"), 89_900);
  assert.equal(parseTND("89.900"), 89_900);
  assert.equal(parseTND("1 200"), 1_200_000);
  assert.equal(parseTND("12,345 DT"), 12_345);
  assert.equal(parseTND("abc"), null);
  assert.equal(parseTND("1.2345"), null);
  assert.equal(parseTND("-5"), null);
});
