import { test } from "node:test";
import assert from "node:assert/strict";
import { descriptionBlocks } from "./description";

test("paragraphs stay paragraphs, and lines starting with a dash become a list", () => {
  assert.deepEqual(descriptionBlocks("Une chaise légère.\n\n- Se plie : 8 cm.\n- Légère : 2 kg.\n\nDans la boîte : la chaise."), [
    { kind: "text", text: "Une chaise légère." },
    { kind: "list", items: ["Se plie : 8 cm.", "Légère : 2 kg."] },
    { kind: "text", text: "Dans la boîte : la chaise." },
  ]);
  // A list right under its first line, in Arabic, with other bullets.
  assert.deepEqual(descriptionBlocks("مزايا:\n• تتطوى\r\n✓ خفيفة\nسطر عادي"), [
    { kind: "text", text: "مزايا:" },
    { kind: "list", items: ["تتطوى", "خفيفة"] },
    { kind: "text", text: "سطر عادي" },
  ]);
  // A dash inside a sentence, a negative number: not a list.
  assert.deepEqual(descriptionBlocks("Prix -20 %\nde 110 - 240 V"), [{ kind: "text", text: "Prix -20 %\nde 110 - 240 V" }]);
  assert.deepEqual(descriptionBlocks(""), []);
});

test("a line of facts joined by dashes reads as a list", () => {
  assert.deepEqual(descriptionBlocks("Lisseur professionnel - Plaques céramique - 450 °C - Garantie 1 an"), [{ kind: "list", items: ["Lisseur professionnel", "Plaques céramique", "450 °C", "Garantie 1 an"] }]);
  // One dash in a sentence stays a sentence.
  assert.deepEqual(descriptionBlocks("Une chaise légère - elle se plie en deux."), [{ kind: "text", text: "Une chaise légère - elle se plie en deux." }]);
});
