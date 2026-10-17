import { test } from "node:test";
import assert from "node:assert/strict";
import { OUT_OF_STOCK, bulkMessage, listHref, listWhere, pageCount, readListParams, tabWhere } from "./list-params";

test("reads the list's address, and falls back to the whole list on odd values", () => {
  assert.deepEqual(readListParams({}), { f: "all", q: "", c: "", page: 1 });
  assert.deepEqual(readListParams({ f: "out", q: "  lampe ", c: "none", page: "3" }), { f: "out", q: "lampe", c: "none", page: 3 });
  assert.equal(readListParams({ f: "drop table" }).f, "all");
  assert.equal(readListParams({ page: "-2" }).page, 1);
  assert.equal(readListParams({ page: "abc" }).page, 1);
  assert.equal(readListParams({ q: ["a", "b"] }).q, "a");
  assert.equal(readListParams({ q: "x".repeat(300) }).q.length, 100);
});

test("builds short links: defaults are left out, a filter change can go back to page 1", () => {
  const p = readListParams({ f: "active", q: "sac à dos", c: "cat1", page: "2" });
  assert.equal(listHref(p), "/admin/produits?f=active&q=sac+%C3%A0+dos&c=cat1&page=2");
  assert.equal(listHref(p, { page: 3 }), "/admin/produits?f=active&q=sac+%C3%A0+dos&c=cat1&page=3");
  assert.equal(listHref(p, { f: "all", q: "", c: "", page: 1 }), "/admin/produits");
});

test("counts pages of 100", () => {
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(100), 1);
  assert.equal(pageCount(101), 2);
  assert.equal(pageCount(450), 5);
});

test("searches the names in both languages, the address, the supplier's ref and the keywords", () => {
  const w = listWhere({ q: "lampe", c: "" });
  const fields = (w.OR ?? []).map((o) => Object.keys(o)[0]);
  assert.deepEqual(fields, ["name", "nameAr", "slug", "supplierRef", "keywords"]);
  assert.deepEqual((w.OR ?? [])[0], { name: { contains: "lampe", mode: "insensitive" } });
  // The database's wildcards are searched as plain characters.
  assert.deepEqual((listWhere({ q: "-50%_a\\b", c: "" }).OR ?? [])[0], { name: { contains: "-50\\%\\_a\\\\b", mode: "insensitive" } });
  assert.equal(listWhere({ q: "", c: "none" }).categoryId, null);
  assert.equal(listWhere({ q: "", c: "abc" }).categoryId, "abc");
  assert.deepEqual(listWhere({ q: "", c: "" }), {});
});

test("each tab adds its own condition to the search", () => {
  const p = readListParams({ q: "sac" });
  assert.equal(tabWhere({ ...p, f: "active" }).active, true);
  assert.equal(tabWhere({ ...p, f: "inactive" }).active, false);
  assert.deepEqual(tabWhere({ ...p, f: "out" }), { AND: [listWhere(p), OUT_OF_STOCK] });
  assert.deepEqual(tabWhere(p), listWhere(p));
});

test("says what a bulk action did, with the database's count", () => {
  assert.equal(bulkMessage({ active: true }, 12), "12 produits mis en ligne.");
  assert.equal(bulkMessage({ active: false }, 1), "1 produit mis hors ligne.");
  assert.equal(bulkMessage({ featured: true }, 3), "3 produits ajoutés à la sélection.");
  assert.equal(bulkMessage({ featured: false }, 1), "1 produit retiré de la sélection.");
  assert.equal(bulkMessage({ available: true }, 4, { skipped: 2 }), "4 produits marqués disponibles. 2 autres comptent leur stock : inchangés.");
  assert.equal(bulkMessage({ available: false }, 0, { skipped: 1 }), "0 produit marqué indisponible. 1 autre compte son stock : inchangé.");
  assert.equal(bulkMessage({ categoryId: "c1" }, 5, { categoryName: "Maison" }), "5 produits rangés dans « Maison ».");
  assert.equal(bulkMessage({ categoryId: null }, 2), "2 produits sans catégorie.");
  assert.equal(bulkMessage("delete", 7), "7 produits supprimés.");
});
