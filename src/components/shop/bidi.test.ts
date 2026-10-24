import { test } from "node:test";
import assert from "node:assert/strict";
import { bidiRuns } from "./Bidi";

const ltr = (s: string) => bidiRuns(s).filter((r) => r.ltr).map((r) => r.text);

test("measures and Latin words in Arabic text are kept left to right", () => {
  assert.deepEqual(ltr("فير ليسور maxisalon 450 °C"), ["maxisalon 450 °C"]);
  assert.deepEqual(ltr("من 450 °C لـ 750 °F"), ["450 °C", "750 °F"]);
  assert.deepEqual(ltr("الضغط 110~ 240 V"), ["110~ 240 V"]);
  assert.deepEqual(ltr("شارجور USB-C سريع"), ["USB-C"]);
  // A bare number reads the same either way.
  assert.deepEqual(ltr("اشري 2 والثالثة هدية"), []);
  // The whole text comes back, nothing lost or added.
  const s = "فير ليسور (MAXISALON) 450 °C، ضمان عام";
  assert.equal(bidiRuns(s).map((r) => r.text).join(""), s);
});

test("French text is left as it is", () => {
  assert.deepEqual(bidiRuns("Lisseur 450 °C"), [{ text: "Lisseur 450 °C", ltr: false }]);
});
