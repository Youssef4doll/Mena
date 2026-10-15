import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, isMobile, formatPhone } from "./phone";

test("accepts the ways Tunisians type a number", () => {
  // Arabic keyboards type ٢٢ (or ۲۲); some people put a 0 in front out of habit.
  for (const v of ["22123456", "22 123 456", "+216 22 123 456", "0021622123456", "21622123456", "22.123.456", "٢٢١٢٣٤٥٦", "۲۲ ۱۲۳ ۴۵۶", "+٢١٦ ٢٢ ١٢٣ ٤٥٦", "022123456"]) {
    assert.equal(normalizePhone(v), "22123456", v);
  }
});

test("refuses what is not a Tunisian line", () => {
  for (const v of ["", "1234567", "123456789", "12345678", "61234567", "88888888", "22222222", "+33 6 12 34 56 78"]) {
    assert.equal(normalizePhone(v), null, v);
  }
});

test("mobile vs fixed", () => {
  assert.equal(isMobile("22123456"), true);
  assert.equal(isMobile("98123456"), true);
  assert.equal(isMobile("71123456"), false);
  assert.equal(formatPhone("22123456"), "22 123 456");
});
