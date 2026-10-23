import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanIdeas, imagePrompt, longImagePrompt, manualIdeasRequest, readIdeasAnswer, type ImageIdea } from "./image-ideas";

const beforeAfter: ImageIdea = {
  kind: "before_after", headlineAr: "شعر ناعم من أول مرة", headlineFr: "Des cheveux lisses dès le premier passage",
  points: [{ ar: "450 درجة", fr: "450 °C" }], scene: "Smooth, straight hair after one pass of the straightener.", sceneBefore: "Frizzy hair in the morning.",
};
const features: ImageIdea = {
  kind: "features", headlineAr: "كل ما تحتاج", headlineFr: "Tout ce qu'il faut", points: [{ ar: "بلاكات سيراميك", fr: "Plaques en céramique" }, { ar: "شاشة", fr: "Écran" }],
  scene: "The straightener open, plates visible.", sceneBefore: "",
};

test("a before/after request splits the picture and labels both halves in the page's language", () => {
  const ar = imagePrompt(beforeAfter, "ar");
  assert.ok(ar.includes("- Headline:\n  «شعر ناعم من أول مرة»"));
  assert.ok(ar.includes("- Tag on the top half:\n  «قبل»") && ar.includes("«بعد»"));
  assert.ok(ar.includes("Frizzy hair in the morning.") && ar.includes("Smooth, straight hair"));
  assert.ok(ar.includes("right to left"));
  assert.ok(ar.includes("exactly as it is"));
  assert.ok(ar.includes("Never add: a price"));
  const fr = imagePrompt(beforeAfter, "fr");
  assert.ok(fr.includes("«Avant»") && fr.includes("«Après»") && fr.includes("«450 °C»"));
  assert.ok(!fr.includes("right to left"));
});

test("callouts point at the product's parts; one long picture holds every part in order", () => {
  const fr = imagePrompt(features, "fr");
  assert.ok(fr.includes("2 callouts") && fr.includes("- Callout 1:\n  «Plaques en céramique»\n- Callout 2:\n  «Écran»"));
  // Every Arabic text on a line of its own: never mixed with the English instructions.
  for (const line of imagePrompt(beforeAfter, "ar").split("\n")) assert.ok(!/[\u0600-\u06ff]/.test(line) || /^  «[^»]+»$/.test(line), line);
  const long = longImagePrompt([features, beforeAfter], "ar");
  assert.ok(long.includes("9:16") && long.includes("2 bands"));
  assert.ok(long.indexOf("- Band 1, headline:\n  «كل ما تحتاج»") < long.indexOf("- Band 2, headline:\n  «شعر ناعم من أول مرة»"));
  assert.ok(long.includes("- Band 2, tag on the top half:\n  «قبل»"));
});

test("reads the ideas of a chat reply, tolerating an unknown kind, and drops the empty ones", () => {
  const reply = `Voici :\n\`\`\`json\n${JSON.stringify({ imageIdeas: [{ ...features, kind: "gallery" }, { ...beforeAfter, points: [{ ar: "", fr: "" }, { ar: "a", fr: "b" }, { ar: "c", fr: "d" }, { ar: "e", fr: "f" }, { ar: "g", fr: "h" }] }, { kind: "hero", headlineAr: "", headlineFr: "", points: [], scene: "x", sceneBefore: "" }] })}\n\`\`\``;
  const ideas = readIdeasAnswer(reply)!;
  assert.equal(ideas.length, 2);
  assert.equal(ideas[0].kind, "hero");
  assert.equal(ideas[1].points.length, 3);
  assert.equal(readIdeasAnswer("Je ne peux pas."), null);
  assert.equal(readIdeasAnswer(JSON.stringify({ imageIdeas: [] })), null);
  assert.equal(cleanIdeas([{ ...features, headlineFr: "x".repeat(200) }])[0].headlineFr.length, 80);
});

test("the request for a product's pictures carries its texts and the rules", () => {
  const r = manualIdeasRequest({ name: "Lisseur 450 °C", nameAr: "", summary: "", description: "Plaques en céramique.", descriptionAr: "", specs: "Tension : 110–240 V" });
  assert.ok(r.includes("Lisseur 450 °C") && r.includes("Tension : 110–240 V"));
  assert.ok(r.includes("never for weight, body shape, skin or health"));
  assert.ok(r.includes('"imageIdeas"'));
});
