import { test } from "node:test";
import assert from "node:assert/strict";
import { REPORT_SCHEMA, TEXT_KEYS, WEB_SYSTEM, cleanTexts, readWebReply, webBatchRequest, webTask } from "./web-complete-prompt";

const product = { ref: "P1", name: "Lampe tactile", nameAr: "لمبة", summary: "", description: "Une lampe.", specs: "" };

test("the request: the products by their ref, the rules against invented facts and copied texts", () => {
  const r = webBatchRequest([product, { ...product, ref: "P2", name: "Diffuseur" }]);
  assert.match(r, /"ref":"P1"/);
  assert.match(r, /"ref":"P2"/);
  assert.match(r, /Never copy a sentence/);
  assert.match(r, /Never write a rating, a review/);
  assert.match(r, /Never make up an address/);
  assert.match(webTask(product), /call the tool "report" once/);
  assert.ok(WEB_SYSTEM.includes("Tunisian Arabic"));
  // The API's form and the reply's ask for the same texts.
  assert.deepEqual(REPORT_SCHEMA.properties.texts.required, TEXT_KEYS);
});

test("a pasted reply: read whole, or object by object when cut short or wrapped in words", () => {
  const one = { ref: "P1", pages: [{ url: "https://brand.com/lampe", title: "Lampe", sure: true }], images: ["https://brand.com/1.jpg"], video: "https://youtu.be/abcdefghijk", texts: { description: "Une lampe tactile." } };
  const whole = readWebReply(`Voici :\n\`\`\`json\n${JSON.stringify([one, { ...one, ref: "P2" }])}\n\`\`\``);
  assert.deepEqual([...whole.keys()], ["P1", "P2"]);
  assert.equal(whole.get("P1")?.pages[0].sure, true);
  const cut = readWebReply(`[${JSON.stringify(one)}, {"ref": "P2", "pages": [`);
  assert.deepEqual([...cut.keys()], ["P1"]);
  // An object without its ref, or of another form, is left out.
  assert.equal(readWebReply(`[{"pages": []}, {"ref": "P3", "pages": "none"}]`).size, 0);
  // Missing parts read as empty.
  assert.deepEqual(readWebReply(`[{"ref": "P4"}]`).get("P4"), { pages: [], images: [], video: "", texts: {} });
});

test("texts as the shop stores them: one line where the editor has one, within its lengths, empty ones dropped", () => {
  const t = cleanTexts({ summary: "  Une lampe\nqui éclaire.  ", description: "Ligne 1\r\n\r\n- Point", seoTitle: "x".repeat(200), keywords: "" });
  assert.equal(t.summary, "Une lampe qui éclaire.");
  assert.equal(t.description, "Ligne 1\n\n- Point");
  assert.equal(t.seoTitle?.length, 120);
  assert.ok(!("keywords" in t));
});
