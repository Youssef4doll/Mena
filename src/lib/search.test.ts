import { test } from "node:test";
import assert from "node:assert/strict";
import { complete, distance, matchWord, normalize, rank, tokenize, withSynonyms, type Doc } from "./search";

const doc = (id: string, ...texts: string[]): Doc => ({ id, fields: texts.map((t, i) => ({ tokens: tokenize(t), weight: i === 0 ? 3 : 1 })) });
const catalogue = [
  doc("lampe", "Lampe de chevet tactile", "لمبة سرير باللمس", "lamba lampa"),
  doc("diffuseur", "Diffuseur d'huiles essentielles", "موزّع زيوت عطرية"),
  doc("verres", "Set de 6 verres ambrés", "طقم 6 كيسان عنبري"),
  doc("montre", "Montre minimaliste", "ساعة بسيطة"),
  doc("miroir", "Miroir LED de maquillage", "مراية LED للماكياج"),
];
const ids = (q: string, prefix = false) => rank(q, catalogue, { prefix }).map((r) => r.id);

test("texts are compared without accents, case or Arabic letter variants", () => {
  assert.equal(normalize("Ambrés Œuvre"), "ambres oeuvre");
  assert.equal(normalize("مُوزّع إضاءة"), normalize("موزع اضاءه"));
  assert.equal(normalize("٦ كيسان"), "6 كيسان");
  assert.deepEqual(tokenize("L'huile, d'olive"), ["huile", "olive"]);
  assert.ok(tokenize("المراية").includes(normalize("مراية")));
});

test("a mistake is a swap, a missing, extra or wrong letter", () => {
  assert.equal(distance("lampe", "lampe"), 0);
  assert.equal(distance("lamep", "lampe"), 1);
  assert.equal(distance("lmpe", "lampe"), 1);
  assert.equal(distance("diffusuer", "diffuseur"), 1);
  assert.equal(distance("abc", "xyz", 1), 2);
});

test("a word matches exactly, as a start, inside, or with a mistake; short words must be right", () => {
  assert.equal(matchWord("lampe", "lampe", false), 1);
  assert.ok(matchWord("lam", "lampe", true) > 0.9);
  assert.ok(matchWord("lamep", "lampe", false) > 0);
  assert.equal(matchWord("lap", "lampe", false), 0);
  assert.equal(matchWord("xyz", "lampe", false), 0);
});

test("the right product is found with mistakes, in French, Arabic or Latin-written Tunisian", () => {
  assert.equal(ids("lampe")[0], "lampe");
  assert.equal(ids("lamep de chevt")[0], "lampe");
  assert.equal(ids("difusseur")[0], "diffuseur");
  assert.equal(ids("موزع")[0], "diffuseur");
  assert.equal(ids("مرايه")[0], "miroir");
  assert.equal(ids("lamba")[0], "lampe");
  assert.equal(ids("verre ambre")[0], "verres");
  assert.deepEqual(ids("zzzz"), []);
});

test("every word must be found, so a second word narrows the search", () => {
  assert.deepEqual(ids("led maquillage"), ["miroir"]);
  assert.deepEqual(ids("montre maquillage"), []);
});

test("while typing, the start of a word is enough", () => {
  assert.equal(ids("mon", true)[0], "montre");
  assert.equal(ids("ساع", true)[0], "montre");
  // Still typing, and a letter missing.
  assert.equal(ids("difus", true)[0], "diffuseur");
});

test("the corrected word is told, for a 'did you mean'", () => {
  const r = rank("lamep", catalogue)[0];
  assert.equal(r.corrected.get("lamep"), "lampe");
});

test("completions start with what is typed, like Google's", () => {
  const phrases = ["Lampe de chevet tactile", "Lampes", "Maison", "Montre minimaliste", "Miroir LED de maquillage"];
  assert.deepEqual(complete("lam", phrases).slice(0, 2), ["Lampes", "Lampe de chevet tactile"]);
  assert.deepEqual(complete("maq", phrases), ["Miroir LED de maquillage"]);
  assert.deepEqual(complete("m", phrases), []);
});

test("the shorter word decides the mistakes forgiven, so a long typo does not land on a short word", () => {
  // "kess" (Tunisian for a glass) is "kes" with one letter more.
  assert.ok(matchWord("kess", "kes", false) > 0);
  assert.equal(matchWord("makina", "main", false), 0);
  // Short words must still be right: a bag is not an ice tray.
  assert.equal(matchWord("sac", "bac", false), 0);
  assert.equal(matchWord("كاس", "راس", false), 0);
  // A short start with a mistake no longer matches half the catalogue; five letters still do.
  assert.equal(matchWord("lemp", "lampadaire", true), 0);
  assert.ok(matchWord("difus", "diffuseur", true) > 0);
});

test("a plural or feminine ending is the same word, not a 'did you mean'", () => {
  const cat = [doc("lampe", "Lampe de chevet noir")];
  assert.equal(rank("lampe noire", cat)[0].corrected.size, 0);
  assert.equal(rank("lampes", cat)[0].corrected.size, 0);
});

test("Arabic spellings with or without the long alef find the same products; a short Arabic word must be right", () => {
  assert.ok(matchWord(normalize("ماكياج"), normalize("مكياج"), false) >= 0.95);
  assert.ok(matchWord(normalize("مكياج"), normalize("ماكياج"), false) >= 0.95);
  assert.equal(matchWord(normalize("بخار"), normalize("بار"), false), 0);
});

test("a product named in French is found by its Arabic or Tunisian name", () => {
  assert.ok(withSynonyms(tokenize("Trousse de maquillage")).includes("مكياج"));
  assert.ok(withSynonyms(tokenize("لمبة سرير")).includes("lampe"));
});
