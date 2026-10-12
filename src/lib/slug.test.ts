import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "./slug";

test("slugs", () => {
  assert.equal(slugify("Lampe de chevet — Édition 2"), "lampe-de-chevet-edition-2");
  assert.equal(slugify("  Cœur  "), "coeur");
  assert.equal(slugify("لمبة"), "");
});
