import { test } from "node:test";
import assert from "node:assert/strict";
import { readSheet } from "../product-csv";
import { findFile, formatDuration, formatSize, indexFiles, isPicture, lacksArabic, namesToCreate, planRows, rowNeedsTranslation, summarize, textsOfRow } from "./import-plan";

const file = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: "image/jpeg" });

test("finds a photo by its name without case, with or without its extension or folder", () => {
  const a = file("Lampe-1.JPG");
  const b = file("diffuseur.png");
  const idx = indexFiles([a, b, file("lampe-1.jpg")]);
  assert.equal(idx.count, 2);
  assert.equal(findFile(idx, "lampe-1.jpg"), a);
  assert.equal(findFile(idx, "LAMPE-1"), a);
  assert.equal(findFile(idx, "Photos/lampe-1.jpeg"), a);
  assert.equal(findFile(idx, "diffuseur.webp"), b);
  assert.equal(findFile(idx, "autre.jpg"), undefined);
  assert.equal(findFile(idx, " "), undefined);
});

test("keeps only pictures from a chosen folder", () => {
  assert.equal(isPicture({ name: "a.HEIC", type: "" }), true);
  assert.equal(isPicture({ name: "x", type: "image/webp" }), true);
  assert.equal(isPicture({ name: "notes.txt", type: "text/plain" }), false);
});

test("plans new rows, updates, duplicates and pictures", () => {
  const sheet = readSheet(
    [
      "nom;prix;photos;images_description;adresse",
      "Lampe A;10;\"https://a.com/1.jpg ; lampe.jpg ; perdue.jpg\";long.png;",
      "Lampe B;12;;;",
      "lampe a;11;;;",
      "Autre nom;;;;lampe-b",
      "Sans prix;;;;",
      ";;;;inconnue",
    ].join("\n"),
  );
  const files = indexFiles([file("lampe.jpg"), file("long.png")]);
  const plan = planRows(sheet.rows, { "lampe-b": { id: "p1", name: "Lampe B" } }, files);

  assert.equal(plan[0].status, "new");
  assert.deepEqual(plan[0].pictures.map((p) => [p.kind, p.index, p.url ?? p.file?.name]), [["GALLERY", 0, "https://a.com/1.jpg"], ["GALLERY", 1, "lampe.jpg"], ["DETAIL", 0, "long.png"]]);
  assert.deepEqual(plan[0].missing, ["perdue.jpg"]);

  assert.equal(plan[1].status, "update");
  assert.equal(plan[1].existing?.name, "Lampe B");
  // Same address as line 2 once made from the name.
  assert.equal(plan[2].status, "error");
  assert.match(plan[2].errors.join(), /ligne 2/);
  // Another address of the same product: still the same product.
  assert.equal(plan[3].status, "error");
  assert.match(plan[3].errors.join(), /ligne 3/);
  assert.match(plan[4].errors.join(), /sans prix/);
  assert.match(plan[5].errors.join(), /Aucun produit à l'adresse « inconnue »/);
});

test("summarizes, estimating only what is stored anew", () => {
  const sheet = readSheet(
    [
      "nom;prix;photos;images_description",
      "Lampe A;10;https://a.com/1.jpg;https://a.com/long.jpg",
      "Lampe B;10;https://mena.tn/api/img/clx0000000000000000000000/1600;",
      "Lampe C;abc;https://a.com/2.jpg;",
      "Lampe D;10;perdue.jpg;",
    ].join("\n"),
  );
  const s = summarize(planRows(sheet.rows, {}, indexFiles([])));
  assert.deepEqual({ ...s }, { lines: 4, created: 3, updated: 0, errors: 1, pictures: 2, bytes: 650 * 1024, missing: 1 });
});

test("lists the new categories of imported rows once, with the first Arabic name given", () => {
  const sheet = readSheet(["nom;prix;categorie;categorie_ar;fournisseur", "Lampe A;1;Maison;;Ali", "Lampe B;1;maison;الدار;ali", "Lampe C;x;Jardin;جنينة;", "Lampe D;1;Cuisine;;"].join("\n"));
  const plan = planRows(sheet.rows, {}, indexFiles([]));
  assert.deepEqual(namesToCreate(plan, ["Maison", "maison", "Jardin"], "category"), [{ name: "Maison", nameAr: "الدار" }]);
  assert.deepEqual(namesToCreate(plan, ["Ali", "ali"], "supplier"), [{ name: "Ali" }]);
});

test("tells a product without Arabic from one that only lacks its keywords", () => {
  const plain = readSheet("nom;prix\nLampe;10").rows[0].data;
  assert.equal(rowNeedsTranslation(plain), true);
  assert.equal(lacksArabic(textsOfRow(plain)), true);
  const both = readSheet("nom;nom_ar;prix;offres\nLampe;لمبة;10;2 = 18").rows[0].data;
  assert.equal(lacksArabic(textsOfRow(both)), false, "automatic offer labels have their Arabic");
  assert.equal(rowNeedsTranslation(both), true, "no keywords yet");
  const noGoogle = readSheet("nom;nom_ar;prix;mots_cles\nLampe;لمبة;10;veilleuse").rows[0].data;
  assert.equal(rowNeedsTranslation(noGoogle), true, "no title or description for Google yet");
  const done = readSheet("nom;nom_ar;prix;mots_cles;titre_google;titre_google_ar;description_google;description_google_ar\nLampe;لمبة;10;veilleuse;Lampe;لمبة;Une lampe.;لمبة.").rows[0].data;
  assert.equal(rowNeedsTranslation(done), false);
});

test("writes sizes and durations the French way", () => {
  assert.equal(formatSize(1.5 * 1024 * 1024), "1,5 Mo");
  assert.equal(formatSize(300 * 1024 * 1024), "300 Mo");
  assert.equal(formatSize(600 * 1024 * 1024), "600 Mo");
  assert.equal(formatSize(1.5 * 1024 * 1024 * 1024), "1,5 Go");
  assert.equal(formatDuration(4_400), "4 s");
  assert.equal(formatDuration(185_000), "3 min 05 s");
  assert.equal(formatDuration(3_720_000), "1 h 02 min");
});

test("flags in the preview what the server would refuse", () => {
  const sheet = readSheet(["nom;prix;offres", "لمبة سرير;20;", "X;10;", "Lampe chère;200000;", "Lampe offre;20;2 = 150000", "Lampe juste;100000;"].join("\n"));
  const plan = planRows(sheet.rows, {}, indexFiles([]));
  assert.match(plan[0].errors.join(), /lettres latines/);
  assert.match(plan[1].errors.join(), /2 caractères au moins/);
  assert.match(plan[2].errors.join(), /100 000 DT au plus/);
  assert.match(plan[3].errors.join(), /100 000 DT au plus/);
  assert.equal(plan[4].status, "new");
});

test("a file named twice in one cell is sent once", () => {
  const sheet = readSheet(['nom;prix;photos;images_description', 'Lampe;10;"lampe-1.jpg ; Lampe-1 ; LAMPE-1.JPG ; lampe-2.jpg";lampe-1.jpg'].join("\n"));
  const plan = planRows(sheet.rows, {}, indexFiles([file("lampe-1.jpg"), file("lampe-2.jpg")]));
  assert.deepEqual(plan[0].pictures.map((p) => [p.kind, p.index, p.file?.name]), [["GALLERY", 0, "lampe-1.jpg"], ["GALLERY", 3, "lampe-2.jpg"], ["DETAIL", 0, "lampe-1.jpg"]]);
  assert.deepEqual(plan[0].missing, []);
});
