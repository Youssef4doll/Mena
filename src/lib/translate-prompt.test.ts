import { test } from "node:test";
import assert from "node:assert/strict";
import { manualRequest, readManualAnswer } from "./translate-prompt";
import { mergeTranslation, type ProductTexts } from "./translate-merge";

const texts: ProductTexts = {
  name: "Lampe de chevet", nameAr: "", summary: "", summaryAr: "", description: "", descriptionAr: "",
specs: "", specsAr: "", keywords: "", variants: [{ name: "Noir", nameAr: "" }], offers: [],
};
const answer = { ...texts, nameAr: "لمبة متاع بيت النوم", keywords: "lampe, lamba", variants: [{ name: "Noir", nameAr: "كحلة" }] };

test("puts the texts and the rules in one request", () => {
  const r = manualRequest(texts, "fill");
  assert.ok(r.includes("Tunisian Arabic"));
  assert.ok(r.includes('"name": "Lampe de chevet"'));
});

test("reads the JSON out of a chat reply with text and code fences around it", () => {
  const reply = `Voici la traduction :\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\`\nBonne vente.`;
  assert.equal(readManualAnswer(reply)?.nameAr, "لمبة متاع بيت النوم");
});

test("refuses a cut or incomplete reply", () => {
  assert.equal(readManualAnswer(JSON.stringify(answer).slice(0, 60)), null);
  assert.equal(readManualAnswer(JSON.stringify({ nameAr: "x" })), null);
  assert.equal(readManualAnswer(""), null);
});

test("fills only the empty fields", () => {
  const merged = mergeTranslation(texts, { ...answer, name: "Autre nom" }, "fill");
  assert.equal(merged.name, "Lampe de chevet");
  assert.equal(merged.nameAr, "لمبة متاع بيت النوم");
  assert.equal(merged.variants[0].nameAr, "كحلة");
});
