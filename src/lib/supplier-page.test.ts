import { test } from "node:test";
import assert from "node:assert/strict";
import { factsFromPage, frenchCategory, imagesFromHtml, originalImageUrl, pageText, priceFromRule, productCode, readSupplierList } from "./supplier-page";

const THUMB = "https://www.ecomness.com/_next/image?url=https%3A%2F%2Futfs.io%2Ff%2Fq7nkwVbrAscqGZTNVGCtavuPK4wjemR5QTbZ2IfndsEBlyLY&w=384&q=75";
const PHOTO = "https://utfs.io/f/q7nkwVbrAscqGZTNVGCtavuPK4wjemR5QTbZ2IfndsEBlyLY";

test("a resized picture becomes the original, at full size", () => {
  assert.equal(originalImageUrl(THUMB), PHOTO);
  assert.equal(originalImageUrl(THUMB.replace(/&/g, "&amp;")), PHOTO);
  assert.equal(originalImageUrl("/_next/image?url=%2Fuploads%2Fa.jpg&w=640&q=75", "https://shop.example/produit/x"), "https://shop.example/uploads/a.jpg");
  assert.equal(originalImageUrl("//cdn.example/a.jpg"), "https://cdn.example/a.jpg");
  assert.equal(originalImageUrl("https://cdn.example/a.jpg?x=1"), "https://cdn.example/a.jpg?x=1");
  assert.equal(originalImageUrl("data:image/png;base64,AAAA"), null);
  assert.equal(originalImageUrl("/a.jpg"), null);
});

// The user's own copy of the Ecomness list, header line included, as the scraping extension gives it.
const LIST = `Image	URL	Inline-flex	Description	Text-sm	Font-medium	Font-medium	Text-md
${THUMB}	https://www.ecomness.com/en/dashboard/marketplace/cmvl2vpev007b58324a1p3fx1	+ 30 %	Chaise de Plage Pliante Petit Modèle	Furniture	ENP-4J6HKB7H	ENSU-748QLGFQ	50 TND
https://www.ecomness.com/_next/image?url=https%3A%2F%2Futfs.io%2Ff%2Fq7nkwVbrAscqrFfFDukJhe8dWvHKNCVRwoyYkaGBIQEDrtTl&w=384&q=75	https://www.ecomness.com/en/dashboard/marketplace/cmt0kogol000ckt27o2yy9hwd	+ 30 %	magsafe PowerBank + Wallet gratuite	Accessories	ENP-J58EFX9H	ENSE-102AWXM8	54 TND
https://www.ecomness.com/_next/image?url=https%3A%2F%2Futfs.io%2Ff%2Fq7nkwVbrAscq6ETeW4ZjwmyopnWz3kvdKcFLVEZ5lBHONPhe&w=384&q=75	https://www.ecomness.com/en/dashboard/marketplace/cmgjiiyws001lsg2fr598o2nc	+ 150 %	Aspirateur Sans Fil Puissant maison	Household	ENP-MNOXYNWI	ENSU-5B7U5LX7	30 TND`;

test("reads the list copied from Ecomness by what each cell holds", () => {
  const items = readSupplierList(LIST)!;
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], {
    name: "Chaise de Plage Pliante Petit Modèle", photo: PHOTO, thumb: THUMB, link: "https://www.ecomness.com/en/dashboard/marketplace/cmvl2vpev007b58324a1p3fx1",
    category: "Furniture", ref: "ENP-4J6HKB7H", cost: 50_000,
  });
  assert.deepEqual(items.map((i) => [i.name, i.category, i.ref, i.cost]), [
    ["Chaise de Plage Pliante Petit Modèle", "Furniture", "ENP-4J6HKB7H", 50_000],
    ["magsafe PowerBank + Wallet gratuite", "Accessories", "ENP-J58EFX9H", 54_000],
    ["Aspirateur Sans Fil Puissant maison", "Household", "ENP-MNOXYNWI", 30_000],
  ]);
  // Columns in another order, a line copied twice, an unknown category: the same reading.
  const other = readSupplierList(`ENP-AAAA1111\t12,5 TND\tGadgets\tLampe de nuit LED\t${THUMB}\nENP-AAAA1111\t12,5 TND\tGadgets\tLampe de nuit LED\t${THUMB}`)!;
  assert.deepEqual(other.map((i) => [i.name, i.category, i.cost, i.photo]), [["Lampe de nuit LED", "Gadgets", 12_500, PHOTO]]);
  assert.equal(readSupplierList("Une page produit\nsans tableau"), null);
  assert.equal(readSupplierList("nom\tprix\nLampe\t12"), null);
});

test("names Ecomness's categories in French", () => {
  assert.equal(frenchCategory("Furniture"), "Meubles");
  assert.equal(frenchCategory(" household "), "Maison");
  assert.equal(frenchCategory("Pêche"), "Pêche");
});

test("finds the product photos of a copied page, once each, without the site's drawings", () => {
  const html = `<html><body><img src="https://www.ecomness.com/logo.png" alt="Ecomness">
    <img alt="Chaise" src="${THUMB.replace(/&/g, "&amp;")}" srcset="${THUMB.replace("w=384", "w=640").replace(/&/g, "&amp;")} 1x, ${THUMB.replace("w=384", "w=1080").replace(/&/g, "&amp;")} 2x">
    <img src='https://app1.ufs.sh/f/q7nkwVbrAscqGZTNVGCtavuPK4wjemR5QTbZ2IfndsEBlyLY'>
    <picture><source srcset="https://cdn.example/p/2.webp 640w, https://cdn.example/p/2-big.webp 1600w"><img src="https://cdn.example/p/2.jpg"></picture>
    <img src="https://cdn.example/icons/cart.svg"><img src="data:image/gif;base64,R0lG"><img src="https://cdn.example/w_100,h_100/3.jpg"></body></html>`;
  assert.deepEqual(imagesFromHtml(html), [PHOTO, "https://cdn.example/p/2-big.webp", "https://cdn.example/p/2.jpg", "https://cdn.example/w_100,h_100/3.jpg"]);
  assert.deepEqual(imagesFromHtml('<base href="https://shop.example/"><img src="/img/a.jpg"><img src="b.png">'), ["https://shop.example/img/a.jpg", "https://shop.example/b.png"]);
});

test("keeps the page's text short and without repeated lines, and finds its product code", () => {
  assert.equal(pageText("  Menu \n\n\n\nMenu\nChaise   pliante\r\n\r\n Prix : 50 TND  \n"), "Menu\n\nChaise pliante\n\nPrix : 50 TND");
  assert.equal(pageText("a\na\nb"), "a\nb");
  assert.equal(productCode("Product Code : ENP-4J6HKB7H Supplier : ENSU-748QLGFQ"), "ENP-4J6HKB7H");
  assert.equal(productCode("Aucun code"), "");
});

test("a price from the owner's rule ends in ,900", () => {
  assert.equal(priceFromRule(20_000, { times: 2, plus: 10 }), 49_900);
  assert.equal(priceFromRule(20_000, { times: 2.5, plus: 4.4 }), 54_900);
  assert.equal(priceFromRule(7_000, { times: 2, plus: 10 }), 23_900);
  assert.equal(priceFromRule(0, { times: 1, plus: 0 }), 900);
});

test("a product page read without the AI: name, cost, description and facts, without the site around them", () => {
  const text = [
    "Ecomness", "Marketplace", "My products",
    "Chaise de Plage Pliante", "Product Code : ENP-4J6HKB7H", "Prix : 20 TND", "Stock : 120",
    "Description",
    "Chaise légère en aluminium, elle se plie en deux et tient dans un coffre.",
    "Poids : 2 kg", "Couleur : Beige",
    "Produits similaires", "Table basse pliante",
  ].join("\n");
  const f = factsFromPage(text, "<main><h1>Chaise de Plage <b>Pliante</b></h1></main>");
  assert.equal(f.name, "Chaise de Plage Pliante");
  assert.equal(f.cost, 20_000);
  assert.equal(f.ref, "ENP-4J6HKB7H");
  assert.equal(f.description, "Chaise légère en aluminium, elle se plie en deux et tient dans un coffre.");
  assert.equal(f.specs, "Poids : 2 kg\nCouleur : Beige");
});

test("without a description heading, the page's sentences are its description", () => {
  const f = factsFromPage("Marketplace\nLampe de chevet tactile\nProduct Code : ENP-AB12CD34\n15 TND\nLumière douce en trois intensités, se recharge en USB en deux heures.\nAjouter à mes produits");
  assert.equal(f.name, "Lampe de chevet tactile");
  assert.equal(f.cost, 15_000);
  assert.equal(f.description, "Lumière douce en trois intensités, se recharge en USB en deux heures.");
});
