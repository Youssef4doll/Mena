import { test } from "node:test";
import assert from "node:assert/strict";
import { COLUMNS, EMPTY_PRODUCT, decodeText, detectDelimiter, mergeRow, parseDelimited, productsToCsv, readOffers, readSheet, rowKey, splitSources, templateCsv, type ExportProduct } from "./product-csv";

test("reads Excel's French CSV: semicolons, quoted cells with line breaks and quotes", () => {
  const csv = 'nom;prix;description\r\n"Lampe; LED";59,900;"Ligne 1\r\nLigne ""2"""\r\n\r\nSac;35;\r\n';
  assert.equal(detectDelimiter(csv), ";");
  assert.deepEqual(parseDelimited(csv), [
    ["nom", "prix", "description"],
    ["Lampe; LED", "59,900", 'Ligne 1\r\nLigne "2"'],
    ["Sac", "35", ""],
  ]);
});

test("reads rows pasted from a spreadsheet (tabs) and Google Sheets' commas", () => {
  assert.equal(detectDelimiter("nom\tprix\nA\t1"), "\t");
  assert.equal(detectDelimiter("nom,prix\nA,1"), ",");
  assert.deepEqual(parseDelimited("nom,prix\n\"A, B\",\"1,5\""), [["nom", "prix"], ["A, B", "1,5"]]);
});

test("decodes UTF-8 (with its BOM) and falls back to Windows-1252 for old Excel files", () => {
  assert.equal(decodeText(new TextEncoder().encode("﻿nom;لمبة")), "nom;لمبة");
  assert.equal(decodeText(new Uint8Array([0x63, 0x61, 0x74, 0xe9])), "caté");
});

test("matches column names typed by hand", () => {
  const s = readSheet("Nom;Nom (arabe);Prix de vente;Catégorie;Images\nLampe;لمبة;59,9;Maison;https://a.com/1.jpg");
  assert.deepEqual(s.columns, ["name", "nameAr", "price", "category", "photos"]);
  const d = s.rows[0].data;
  assert.equal(d.name, "Lampe");
  assert.equal(d.nameAr, "لمبة");
  assert.equal(d.price, 59_900);
  assert.equal(d.category, "Maison");
  assert.deepEqual(d.photos, ["https://a.com/1.jpg"]);
  assert.equal(s.rows[0].line, 2);
});

test("refuses a sheet without a name column, and lists unknown columns", () => {
  assert.match(readSheet("prix\n12").error ?? "", /nom/);
  assert.deepEqual(readSheet("nom;couleur préférée\nA;bleu").unknown, ["couleur préférée"]);
});

test("reads prices, yes/no, stock and the errors a person can fix", () => {
  const s = readSheet("nom;prix;ancien_prix;cout;en_ligne;stock;disponible\nA;59,900;79,9;30;oui;12;non\nB;douze;0;;peut-être;fournisseur;\nC;10;8;;;;");
  const [a, b, c] = s.rows;
  assert.deepEqual([a.data.price, a.data.compareAt, a.data.cost, a.data.active, a.data.stockQty, a.data.available], [59_900, 79_900, 30_000, true, 12, false]);
  assert.equal(a.errors.length, 0);
  assert.equal(b.data.compareAt, null, "0 removes the old price");
  assert.equal(b.data.stockQty, null, "fournisseur = dropshipping");
  assert.ok(b.errors.some((e) => e.includes("prix")));
  assert.ok(b.errors.some((e) => e.includes("oui ou non")));
  assert.ok(c.errors.some((e) => e.includes("ancien prix")));
});

test("a name in Arabic only is refused: the French name is required", () => {
  const r = readSheet("nom;nom_ar;prix\n;لمبة;10").rows[0];
  assert.ok(r.errors.some((e) => e.includes("français")));
});

test("reads offers, with free delivery and names", () => {
  const r = readOffers("1 = 59,900 ; 3 = 119,800 livraison offerte");
  assert.deepEqual(r.offers, [
    { quantity: 1, price: 59_900, freeDelivery: false },
    { quantity: 3, price: 119_800, freeDelivery: true },
  ]);
  assert.equal(r.errors.length, 0);
  assert.ok(readOffers("trois pour cent").errors.length > 0);
  assert.ok(readOffers("2 = 10 ; 2 = 12").errors[0].includes("Deux offres"));
  const s = readSheet('nom;prix;offres;offres_noms;offres_noms_ar\nA;10;"1=10;2=18";"Une;";"حبة;زوز"').rows[0];
  assert.equal(s.data.offers?.[0].label, "Une");
});

test("reads options with their Arabic names, prices and stock by position", () => {
  const s = readSheet('nom;prix;variantes;variantes_ar;variantes_prix;variantes_stock\nA;10;Noir, Blanc;أكحل، أبيض;;"3 ; 0"').rows[0];
  assert.deepEqual(s.data.variants, [
    { name: "Noir", nameAr: "أكحل", stockQty: 3 },
    { name: "Blanc", nameAr: "أبيض", stockQty: 0 },
  ]);
  const p = readSheet('nom;prix;variantes;variantes_prix\nA;10;"S ; M";"12,5 ;"').rows[0];
  assert.deepEqual(p.data.variants?.map((v) => v.price), [12_500, null]);
  assert.ok(readSheet("nom;prix;variantes\nA;10;Noir;noir").rows[0].errors.length === 0, "a short row is fine");
  assert.ok(readSheet('nom;prix;variantes\nA;10;"Noir ; noir"').rows[0].errors.some((e) => e.includes("deux fois")));
});

test("splits picture lists: addresses, file names with spaces, several separators", () => {
  assert.deepEqual(splitSources("https://a.com/1.jpg https://a.com/2.jpg"), ["https://a.com/1.jpg", "https://a.com/2.jpg"]);
  assert.deepEqual(splitSources("photo 1.jpg ; photo 2.jpg|https://x.tn/a,b.png"), ["photo 1.jpg", "photo 2.jpg", "https://x.tn/a,b.png"]);
  assert.deepEqual(splitSources("https://a.com/1.jpg,https://a.com/2.jpg"), ["https://a.com/1.jpg", "https://a.com/2.jpg"]);
});

test("specs separated by ; become one per line", () => {
  assert.equal(readSheet('nom;caracteristiques\nA;"Matière : inox ; Poids : 1 kg"').rows[0].data.specs, "Matière : inox\nPoids : 1 kg");
});

test("the address of a row: given, taken from a full link, or made from the name", () => {
  assert.equal(rowKey(readSheet("nom;adresse\nLampe LED;").rows[0].data), "lampe-led");
  assert.equal(rowKey(readSheet("nom;adresse\nX;https://mena.tn/produit/ma-lampe").rows[0].data), "ma-lampe");
});

test("a row over an existing product changes only what it gives; options and offers keep their ids", () => {
  const base = {
    ...EMPTY_PRODUCT, name: "Lampe", nameAr: "لمبة", slug: "lampe", price: 50_000, active: true, description: "Texte",
    variants: [{ id: "v1", name: "Noir", nameAr: "أكحل", sku: "N1", price: null, stockQty: 2, available: true }],
    offers: [{ id: "o1", label: "1 unité", labelAr: "حبة", quantity: 1, price: 50_000, freeDelivery: false, endsOn: "2026-12-31", active: true }],
  };
  const d = readSheet('adresse;prix;variantes;offres\nlampe;55;"Noir ; Blanc";"1 = 55 ; 2 = 99 livraison offerte"').rows[0].data;
  const m = mergeRow(base, d, {});
  assert.equal(m.name, "Lampe");
  assert.equal(m.description, "Texte");
  assert.equal(m.price, 55_000);
  assert.equal(m.active, true);
  assert.deepEqual(m.variants.map((v) => [v.id, v.name, v.nameAr, v.sku]), [["v1", "Noir", "أكحل", "N1"], [undefined, "Blanc", "", ""]]);
  assert.deepEqual(m.offers.map((o) => [o.id, o.quantity, o.label, o.endsOn, o.freeDelivery]), [["o1", 1, "1 unité", "2026-12-31", false], [undefined, 2, "2 unités", "", true]]);
  assert.equal(m.offers[1].labelAr, "زوز حبات");
});

test("a new product is offline unless asked, and in dropshipping unless a stock is given", () => {
  const d = readSheet("nom;prix\nSac;35").rows[0].data;
  const m = mergeRow(null, d, { categoryId: "c1" });
  assert.deepEqual([m.active, m.stockMode, m.slug, m.categoryId], [false, "SUPPLIER", "sac", "c1"]);
  assert.equal(mergeRow(null, d, {}, true).active, true);
  assert.equal(mergeRow(null, readSheet("nom;prix;stock\nSac;35;4").rows[0].data, {}).stockMode, "TRACKED");
});

test("an exported catalog reads back as the same products", () => {
  const p: ExportProduct = {
    ...EMPTY_PRODUCT, name: "Lampe; LED \"pro\"", nameAr: "لمبة", slug: "lampe-led", price: 59_900, compareAt: 79_000, cost: 30_000,
    description: "Ligne 1\n\nLigne 2", specs: "Matière : inox\nPoids : 1 kg", active: true, stockMode: "TRACKED", stockQty: 7,
    variants: [{ name: "Noir", nameAr: "أكحل", sku: "", price: null, stockQty: 3, available: true }, { name: "Blanc", nameAr: "", sku: "", price: null, stockQty: 4, available: true }],
    offers: [{ label: "1 unité", labelAr: "حبة وحدة", quantity: 1, price: 59_900, freeDelivery: false, endsOn: "", active: true }, { label: "Lot de 3", labelAr: "3 حبات", quantity: 3, price: 150_000, freeDelivery: true, endsOn: "", active: true }],
    category: { name: "Maison", nameAr: "الدار" }, supplier: "Ali", photos: ["https://mena.tn/api/img/abcdefghijklmnopqrst/1600"], detailPhotos: [],
  };
  const csv = productsToCsv([p]);
  assert.ok(csv.startsWith("﻿"));
  const s = readSheet(csv);
  assert.equal(s.unknown.length, 0);
  assert.equal(s.columns.length, COLUMNS.length);
  const r = s.rows[0];
  assert.deepEqual(r.errors, []);
  const m = mergeRow(null, r.data, {});
  for (const k of ["name", "nameAr", "slug", "price", "compareAt", "cost", "description", "specs", "active", "stockMode", "stockQty"] as const) assert.deepEqual(m[k], p[k], k);
  assert.deepEqual(m.variants.map((v) => [v.name, v.nameAr, v.stockQty]), [["Noir", "أكحل", 3], ["Blanc", "", 4]]);
  assert.deepEqual(m.offers.map((o) => [o.quantity, o.price, o.label, o.labelAr, o.freeDelivery]), [[1, 59_900, "1 unité", "حبة وحدة", false], [3, 150_000, "Lot de 3", "3 حبات", true]]);
  assert.deepEqual([r.data.category, r.data.categoryAr, r.data.supplier, r.data.photos], ["Maison", "الدار", "Ali", p.photos]);
});

test("the example template reads without errors", () => {
  const s = readSheet(templateCsv(true));
  assert.equal(s.rows.length, 2);
  assert.deepEqual(s.rows.map((r) => r.errors), [[], []]);
  assert.equal(readSheet(templateCsv(false)).rows.length, 0);
});

test("a cell that looks like a formula is neutralised on export and read back as typed", () => {
  const p: ExportProduct = { ...EMPTY_PRODUCT, name: "=HYPERLINK(\"x\")", slug: "x", price: 1000, description: "- point 1\n- point 2", category: null, supplier: null, photos: [], detailPhotos: [] };
  const csv = productsToCsv([p]);
  assert.ok(csv.includes("'=HYPERLINK"));
  const d = readSheet(csv).rows[0].data;
  assert.equal(d.name, p.name);
  assert.equal(d.description, p.description);
});
