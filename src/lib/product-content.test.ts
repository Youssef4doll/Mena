import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSpecs, parseVideo, soldStep } from "./product-content";

test("specs are read one line at a time, label before the colon", () => {
  assert.deepEqual(parseSpecs("Matière : inox\n\n- Couleur: Noir\nPasse au lave-vaisselle\nDimensions : 32 × 20 cm"), [
    { label: "Matière", value: "inox" },
    { label: "Couleur", value: "Noir" },
    { label: "", value: "Passe au lave-vaisselle" },
    { label: "Dimensions", value: "32 × 20 cm" },
  ]);
  assert.deepEqual(parseSpecs("المادة: إينوكس"), [{ label: "المادة", value: "إينوكس" }]);
  assert.deepEqual(parseSpecs("Garantie :"), [{ label: "", value: "Garantie" }]);
  assert.deepEqual(parseSpecs(null), []);
});

test("only YouTube links and direct video files are accepted", () => {
  assert.deepEqual(parseVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3"), { kind: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(parseVideo("https://youtu.be/dQw4w9WgXcQ"), { kind: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(parseVideo("https://youtube.com/shorts/dQw4w9WgXcQ?feature=share"), { kind: "youtube", id: "dQw4w9WgXcQ" });
  assert.deepEqual(parseVideo("https://cdn.example.com/v/clip.MP4"), { kind: "file", src: "https://cdn.example.com/v/clip.MP4" });
  assert.equal(parseVideo("http://cdn.example.com/clip.mp4"), null);
  assert.equal(parseVideo("https://www.youtube.com/watch?v=short"), null);
  assert.equal(parseVideo("https://example.com/page"), null);
  assert.equal(parseVideo("javascript:alert(1)"), null);
  assert.equal(parseVideo(""), null);
});

test("the orders line is rounded down, and silent under 10", () => {
  assert.equal(soldStep(0), null);
  assert.equal(soldStep(9), null);
  assert.equal(soldStep(10), 10);
  assert.equal(soldStep(29), 20);
  assert.equal(soldStep(99), 50);
  assert.equal(soldStep(100), 100);
  assert.equal(soldStep(12_000), 5000);
});
