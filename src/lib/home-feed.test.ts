import { test } from "node:test";
import assert from "node:assert/strict";
import { diversify, personalize, rankFeed, saving, score, type FeedItem } from "./home-feed";
import type { ProductCard } from "./catalog";

const NOW = Date.UTC(2026, 10, 3);
const card = (id: string, over: Partial<ProductCard> = {}): ProductCard => ({
  id, slug: id, name: id, nameAr: null, price: 50_000, priceFrom: false, packOf: null, compareAt: null,
  images: [{ id: "m", alt: null, width: 1, height: 1, blur: null }], stock: { kind: "in_stock" }, rating: null, sold: null, freeDelivery: false, deal: null, ...over,
});
const item = (id: string, over: Partial<FeedItem> = {}): FeedItem => ({ card: card(id), category: "a", featured: false, createdAt: NOW - 60 * 86_400_000, orders: 0, views: 0, photos: 1, details: 0, ...over });

test("real orders rank first; a product seen twice and ordered once does not beat a steady seller", () => {
  assert.ok(score(item("seller", { orders: 30, views: 600 }), NOW) > score(item("lucky", { orders: 1, views: 2 }), NOW));
  assert.ok(score(item("new", { createdAt: NOW }), NOW) > score(item("old"), NOW));
});

test("a real saving counts: a struck price or a pack cheaper per unit", () => {
  assert.equal(saving(card("x")), 0);
  assert.equal(saving(card("x", { compareAt: 100_000 })), 0.5);
  assert.ok(Math.abs(saving(card("x", { deal: { label: "", labelAr: null, quantity: 2, price: 80_000, freeDelivery: false } })) - 0.2) < 1e-9);
});

test("never three of one category in a row while another waits; sold out and pictureless left out", () => {
  const d = diversify([{ category: "a" }, { category: "a" }, { category: "a" }, { category: "b" }]).map((x) => x.category);
  assert.deepEqual(d, ["a", "a", "b", "a"]);
  const r = rankFeed([item("ok"), item("out", { card: card("out", { stock: { kind: "out" } }) }), item("bare", { card: card("bare", { images: [] }) })], NOW);
  assert.deepEqual(r.map((x) => x.card.id), ["ok"]);
});

test("the visitor's categories move up, what they saw moves down", () => {
  const feed = [item("a1", { category: "a" }), item("a2", { category: "a" }), item("b1", { category: "b" }), item("b2", { category: "b" })];
  assert.deepEqual(personalize(feed, []).map((f) => f.card.id), ["a1", "a2", "b1", "b2"]);
  const p = personalize(feed, ["b1"]).map((f) => f.card.id);
  assert.equal(p[0], "b2");
  assert.equal(p.at(-1), "b1");
});
