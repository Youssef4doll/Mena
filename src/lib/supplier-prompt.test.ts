import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDraft, imagePrompt, manualDraftRequest, readDraftAnswer, type Draft } from "./supplier-prompt";

const draft: Draft = {
  name: "Chaise de plage pliante", nameAr: "كرسي بحر يتطوى", summary: "Se plie en deux secondes.", summaryAr: "يتطوى في ثانيتين.",
  description: "Une chaise légère.\n\n\n\nCadre en aluminium.", descriptionAr: "كرسي خفيف.", specs: "Poids : 2 kg", specsAr: "الوزن: 2 كغ",
  keywords: "chaise, kursi", category: "Maison", supplierPrice: "50 TND", supplierRef: "ENP-4J6HKB7H",
  variants: [{ name: "Beige", nameAr: "بيج", colorHex: "#D8C3A5" }, { name: "beige", nameAr: "", colorHex: "" }, { name: "Vert", nameAr: "خضرا", colorHex: "green" }],
  imageIdeas: [{ headlineAr: "يتطوى في ثانيتين", headlineFr: "Se plie en deux secondes", scene: "The chair folded flat next to a beach bag." }, { headlineAr: "", headlineFr: "", scene: "x" }],
};

test("one request with the rules, the expected fields, the categories and the page", () => {
  const r = manualDraftRequest({ text: "Chaise de Plage Pliante\nPrix : 50 TND", categories: ["Maison", "Sport"] });
  assert.ok(r.includes("Tunisian Arabic"));
  assert.ok(r.includes("Never add a fact"));
  assert.ok(r.includes('"imageIdeas":[{"headlineAr":""'));
  assert.ok(r.includes('["Maison","Sport"]'));
  assert.ok(r.includes("Prix : 50 TND"));
});

test("reads a chat reply with text around it, and keeps it within what a product accepts", () => {
  const d = readDraftAnswer(`Voici la fiche :\n\`\`\`json\n${JSON.stringify(draft)}\n\`\`\``)!;
  assert.equal(d.name, "Chaise de plage pliante");
  assert.equal(d.description, "Une chaise légère.\n\nCadre en aluminium.");
  // A repeated option goes, a colour that is not "#rrggbb" is dropped, an idea without a headline too.
  assert.deepEqual(d.variants, [{ name: "Beige", nameAr: "بيج", colorHex: "#d8c3a5" }, { name: "Vert", nameAr: "خضرا", colorHex: "" }]);
  assert.equal(d.imageIdeas.length, 1);
  assert.equal(readDraftAnswer(JSON.stringify(draft).slice(0, 80)), null);
  assert.equal(readDraftAnswer(JSON.stringify({ ...draft, name: " " })), null);
  assert.equal(readDraftAnswer("pas de JSON"), null);
});

test("names stay on one line and long texts are cut", () => {
  const d = cleanDraft({ ...draft, name: "Chaise\npliante", summary: "x".repeat(400), variants: Array.from({ length: 70 }, (_, i) => ({ name: `V${i}`, nameAr: "", colorHex: "" })) });
  assert.equal(d.name, "Chaise pliante");
  assert.equal(d.summary.length, 300);
  assert.equal(d.variants.length, 60);
});

test("an image request keeps the product as in its photo and spells the headline of the page's language", () => {
  const ar = imagePrompt(draft.imageIdeas[0], "ar");
  assert.ok(ar.includes("exactly as it is"));
  assert.ok(ar.includes("«يتطوى في ثانيتين»"));
  assert.ok(ar.includes("right to left"));
  assert.ok(imagePrompt(draft.imageIdeas[0], "fr").includes("«Se plie en deux secondes»"));
});
