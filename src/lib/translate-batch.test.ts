import { test } from "node:test";
import assert from "node:assert/strict";
import { batchRequest, idsParam, readBatchReply, splitBatches, storedTexts, textWrites, translationSchema } from "./translate-batch";
import { mergeTranslation, type ProductTexts } from "./translate-merge";

const texts = (name: string, more: Partial<ProductTexts> = {}): ProductTexts => ({
  name, nameAr: "", summary: "", summaryAr: "", description: "", descriptionAr: "", specs: "", specsAr: "", keywords: "", variants: [], offers: [], ...more,
});
const product = (n: number, more: Partial<ProductTexts> = {}) => ({ id: `id${n}`, texts: texts(`Produit ${n}`, more) });
// What the assistant sends back for a product: the Arabic name and keywords filled.
const answered = (ref: string, t: ProductTexts) => ({ ref, ...t, nameAr: `منتوج ${ref}`, keywords: "a, b" });

test("reads the ids of the address, drops the malformed ones and the repeats", () => {
  const a = "c".repeat(25);
  const b = "d1".repeat(12);
  assert.equal(idsParam(undefined), null);
  assert.deepEqual(idsParam(`${a},${b}, ${a},DROP TABLE,x`), [a, b]);
  assert.deepEqual(idsParam([a, b]), [a, b]);
  assert.deepEqual(idsParam(""), []);
  assert.equal(idsParam(Array.from({ length: 2500 }, (_, i) => `p${String(i).padStart(24, "0")}`).join(","))!.length, 2000);
});

test("cuts the products into batches of 8 at most, and of about 9000 characters", () => {
  const twenty = Array.from({ length: 20 }, (_, i) => product(i));
  assert.deepEqual(splitBatches(twenty).map((b) => b.length), [8, 8, 4]);
  const long = Array.from({ length: 5 }, (_, i) => product(i, { description: "x".repeat(3000) }));
  assert.deepEqual(splitBatches(long).map((b) => b.length), [2, 2, 1]);
  // A product longer than a whole batch is still asked, alone.
  assert.deepEqual(splitBatches([product(1), product(2, { description: "x".repeat(12000) }), product(3)]).map((b) => b.map((p) => p.id)), [["id1"], ["id2"], ["id3"]]);
  assert.deepEqual(splitBatches([]), []);
});

test("gives each product of a request its id as ref, and matches the reply back by ref, in any order", () => {
  const batch = [product(1), product(2), product(3)];
  const req = batchRequest(batch);
  assert.ok(req.includes('"ref": "id1"') && req.includes('"ref": "id3"'));
  assert.ok(req.includes('"name": "Produit 2"'));
  const reply = "Voici :\n```json\n" + JSON.stringify([answered("id3", batch[2].texts), answered("id1", batch[0].texts)]) + "\n```";
  const r = readBatchReply(batch, reply);
  assert.deepEqual(r.found.map((f) => [f.item.id, f.texts.nameAr]), [["id1", "منتوج id1"], ["id3", "منتوج id3"]]);
  assert.deepEqual(r.absent.map((p) => p.id), ["id2"]);
  assert.equal(r.read, 2);
});

test("never puts the reply of another batch on this batch's products", () => {
  const first = [product(1), product(2)];
  const second = [product(3), product(4)];
  const reply = JSON.stringify(first.map((p) => answered(p.id, p.texts)));
  const r = readBatchReply(second, reply);
  assert.deepEqual(r.found, []);
  assert.deepEqual(r.absent.map((p) => p.id), ["id3", "id4"]);
  // Read, but not for this batch: the page says so instead of "unreadable".
  assert.equal(r.read, 2);
  // A product asked again in a later batch keeps its ref: the first reply still finds it.
  assert.deepEqual(readBatchReply([product(2)], reply).found.map((f) => f.item.id), ["id2"]);
});

test("keeps the finished products of a reply cut short, and ignores refs of another batch", () => {
  const batch = [product(1), product(2), product(3)];
  const full = JSON.stringify([answered("id1", batch[0].texts), answered("id9", batch[1].texts), answered("id2", batch[1].texts), answered("id3", batch[2].texts)], null, 2);
  const cut = full.slice(0, full.lastIndexOf('"nameAr"'));
  const r = readBatchReply(batch, `Voici la traduction [JSON] :\n${cut}`);
  assert.deepEqual(r.found.map((f) => f.item.id), ["id1", "id2"]);
  assert.deepEqual(r.absent.map((p) => p.id), ["id3"]);
  // A brace inside a text does not break the reading.
  const tricky = JSON.stringify([{ ...answered("id1", batch[0].texts), description: 'Taille {M} "grand"' }]);
  assert.equal(readBatchReply(batch, tricky.slice(0, -1)).found[0]?.texts.description, 'Taille {M} "grand"');
  assert.equal(readBatchReply(batch, "Je ne peux pas.").absent.length, 3);
  assert.equal(readBatchReply(batch, "Je ne peux pas.").read, 0);
});

test("reads stored rows with empty Arabic columns as empty texts", () => {
  const t = storedTexts({
    name: "Lampe", nameAr: null, summary: "", summaryAr: null, description: "D", descriptionAr: null, specs: "", specsAr: null, keywords: "",
    variants: [{ name: "Noir", nameAr: null }], offers: [{ label: "1 unité", labelAr: "حبة" }],
  });
  assert.equal(t.nameAr, "");
  assert.deepEqual(t.variants, [{ name: "Noir", nameAr: "" }]);
  assert.deepEqual(t.offers, [{ label: "1 unité", labelAr: "حبة" }]);
});

test("writes only the columns the merge changed, and never what was already written", () => {
  const before = texts("Lampe", { descriptionAr: "وصف كتبو صاحب المحل", description: "Trois intensités.", variants: [{ name: "Noir", nameAr: "" }, { name: "Blanc", nameAr: "أبيض" }], offers: [{ label: "1 unité", labelAr: "" }] });
  const answer = { ...before, nameAr: "لمبة", descriptionAr: "تبدّل", keywords: "lampe, lamba", variants: [{ name: "Noir", nameAr: "أكحل" }, { name: "Blanc", nameAr: "تبدّل" }], offers: [{ label: "1 unité", labelAr: "حبة" }] };
  const w = textWrites(before, mergeTranslation(before, answer, "fill"));
  assert.deepEqual(w, {
    product: { nameAr: "لمبة", keywords: "lampe, lamba" },
    variants: [{ index: 0, name: "Noir", nameAr: "أكحل" }],
    offers: [{ index: 0, label: "1 unité", labelAr: "حبة" }],
  });
  assert.equal(textWrites(before, before), null);
  // A list of options of another length changes none of them.
  assert.equal(textWrites(before, mergeTranslation(before, { ...before, variants: [{ name: "Noir", nameAr: "أكحل" }] }, "fill")), null);
});

test("refuses texts longer than the editor accepts", () => {
  assert.ok(translationSchema.safeParse(texts("Lampe")).success);
  assert.equal(translationSchema.safeParse(texts("Lampe", { descriptionAr: "x".repeat(8001) })).success, false);
  assert.equal(translationSchema.safeParse({ ...texts("Lampe"), variants: undefined }).success, false);
});

test("puts a name or a label written on two lines back on one line, and keeps the lines of a description", () => {
  const r = translationSchema.parse(texts("Lampe", { nameAr: "لمبة\n صغيرة", description: "Un.\n\nDeux.", variants: [{ name: "Noir", nameAr: "أكحل\r\nغامق" }], offers: [{ label: "1 unité", labelAr: "حبة\n" }] }));
  assert.equal(r.nameAr, "لمبة صغيرة");
  assert.equal(r.description, "Un.\n\nDeux.");
  assert.equal(r.variants[0].nameAr, "أكحل غامق");
  assert.equal(r.offers[0].labelAr, "حبة");
});
