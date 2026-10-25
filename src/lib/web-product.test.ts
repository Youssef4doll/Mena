import { test } from "node:test";
import assert from "node:assert/strict";
import { bigImageUrl, extractProductPage, isImageUrl, readLinks, searchLinks, videoLinks } from "./web-product";

test("the largest copy of a picture, from a resized address", () => {
  assert.equal(bigImageUrl("https://m.media-amazon.com/images/I/71abcDEF12L._AC_SX679_.jpg"), "https://m.media-amazon.com/images/I/71abcDEF12L.jpg");
  assert.equal(bigImageUrl("https://m.media-amazon.com/images/I/71abcDEF12L.jpg"), "https://m.media-amazon.com/images/I/71abcDEF12L.jpg");
  assert.equal(bigImageUrl("https://cdn.shopify.com/s/files/1/0001/products/lamp_200x200.jpg?v=123&width=200"), "https://cdn.shopify.com/s/files/1/0001/products/lamp.jpg?v=123");
  assert.equal(bigImageUrl("https://shop.tn/wp-content/uploads/2026/01/lampe-300x300.jpg"), "https://shop.tn/wp-content/uploads/2026/01/lampe.jpg");
  assert.equal(bigImageUrl("not a url"), "not a url");
});

test("a picture address, and links typed by the owner", () => {
  assert.ok(isImageUrl("https://a.com/x/photo.JPG?v=2"));
  assert.ok(!isImageUrl("https://a.com/produit/lampe"));
  assert.deepEqual(readLinks("voir https://a.com/p1, et https://b.com/x.jpg)\nhttps://a.com/p1 ftp://c.com"), ["https://a.com/p1", "https://b.com/x.jpg"]);
  assert.equal(readLinks(Array.from({ length: 12 }, (_, i) => `https://a.com/${i}`).join(" ")).length, 8);
});

test("videos of a page: a player, a link, a short, each once, as the shop's accepted address", () => {
  const html = `<iframe src="https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0"></iframe>
    <a href="https://youtu.be/abcdefghijk">same</a> <a href="https://www.youtube.com/shorts/ZYXWVUTSRQP">short</a>
    <a href="https://vimeo.com/123456789">vimeo</a> <video src="https://cdn.x.com/v.mp4"></video>`;
  assert.deepEqual(videoLinks(html), ["https://www.youtube.com/watch?v=abcdefghijk", "https://www.youtube.com/watch?v=ZYXWVUTSRQP", "https://vimeo.com/123456789"]);
});

test("a shop's product page: structured data first, then the share picture and the page's photos", () => {
  const html = `<html><head>
    <title>Lampe | Boutique</title>
    <meta property="og:image" content="https://shop.com/og.jpg">
    <meta name="description" content="Une lampe de chevet tactile.">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","logo":"https://shop.com/logo.png"},
      {"@type":"Product","name":"Lampe tactile 3 niveaux","description":"Lampe &amp; veilleuse, 3 niveaux de lumière.","image":["https://shop.com/p/lampe-1-600x600.jpg",{"@type":"ImageObject","url":"/p/lampe-2.jpg"}],
       "subjectOf":{"@type":"VideoObject","embedUrl":"https://www.youtube.com/embed/abcdefghijk"}}]}</script>
    <script type="application/ld+json">{ broken </script>
    </head><body><h1>Lampe</h1>
    <img src="/assets/logo.svg"><img src="/p/lampe-3.jpg" alt=""><img src="https://shop.com/p/lampe-1.jpg">
    <div data-large_image="https://shop.com/p/lampe-4.jpg"></div>
    </body></html>`;
  const f = extractProductPage(html, "https://shop.com/produit/lampe");
  assert.equal(f.title, "Lampe tactile 3 niveaux");
  assert.equal(f.description, "Lampe & veilleuse, 3 niveaux de lumière.");
  assert.deepEqual(f.images, ["https://shop.com/p/lampe-1.jpg", "https://shop.com/p/lampe-2.jpg", "https://shop.com/p/lampe-4.jpg", "https://shop.com/og.jpg", "https://shop.com/p/lampe-3.jpg"]);
  assert.deepEqual(f.videos, ["https://www.youtube.com/watch?v=abcdefghijk"]);
});

test("an Amazon page: its large photos and its points", () => {
  const html = `<div id="feature-bullets"><ul><li><span class="a-list-item"> Brume fine, sans bruit </span></li><li><span class="a-list-item">300 ml : toute la nuit</span></li></ul></div>
    <script>var data = {"colorImages":{"initial":[{"hiRes":"https://m.media-amazon.com/images/I/61aaa._AC_SL1500_.jpg","large":"https://m.media-amazon.com/images/I/61aaa._AC_.jpg"},{"hiRes":null,"large":"https://m.media-amazon.com/images/I/71bbb._AC_.jpg"}]}};</script>
    <meta name="title" content="Diffuseur">`;
  const f = extractProductPage(html, "https://www.amazon.fr/dp/B0TEST");
  assert.deepEqual(f.bullets, ["Brume fine, sans bruit", "300 ml : toute la nuit"]);
  assert.deepEqual(f.images, ["https://m.media-amazon.com/images/I/61aaa.jpg", "https://m.media-amazon.com/images/I/71bbb.jpg"]);
});

test("where to look by hand: the product's name in each search", () => {
  const l = searchLinks("Lampe tactile 3 niveaux");
  assert.deepEqual(l.map((x) => x.label), ["Google Images", "Google", "YouTube", "Amazon"]);
  assert.ok(l[0].url.endsWith("tbm=isch&q=Lampe%20tactile%203%20niveaux"));
});
