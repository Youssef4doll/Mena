/**
 * Products in a spreadsheet: reading a CSV file (or rows pasted from Excel or
 * Google Sheets) into product rows, and writing the catalog back in the same
 * format. Shared by the browser (the preview before importing) and the server
 * (which checks every row again before saving it).
 *
 * The format is made for a person filling a sheet by hand: French column
 * names, prices written "59,900", "oui"/"non", lists separated by ";".
 */
import { parseTND } from "./money";
import { slugify } from "./slug";
import type { ProductInput } from "./product-write";
import { readHex } from "./color";

export type ColumnKey =
  | "slug" | "name" | "nameAr" | "summary" | "summaryAr" | "description" | "descriptionAr" | "specs" | "specsAr" | "keywords"
  | "price" | "compareAt" | "cost" | "category" | "categoryAr" | "supplier" | "supplierRef" | "supplierUrl"
  | "stock" | "available" | "active" | "featured" | "photos" | "detailPhotos" | "videoUrl"
  | "variants" | "variantsAr" | "variantColors" | "variantPrices" | "variantStock" | "offers" | "offerLabels" | "offerLabelsAr"
  | "seoTitle" | "seoTitleAr" | "seoDescription" | "seoDescriptionAr";

type Column = { key: ColumnKey; header: string; aliases: string[]; help: string; example: string; group: string };

/** In the order of the template. `header` is what the template and the export write. */
export const COLUMNS: Column[] = [
  { key: "name", header: "nom", aliases: ["nom francais", "nom fr", "name", "titre", "produit", "nom du produit"], group: "Texte", help: "Nom en français. Obligatoire pour un nouveau produit.", example: "Lampe de chevet tactile LED rechargeable" },
  { key: "nameAr", header: "nom_ar", aliases: ["nom arabe", "nom en arabe", "name ar", "arabe"], group: "Texte", help: "Nom en arabe. Vide : à traduire après l'import.", example: "لمبة سرير باللمس" },
  { key: "price", header: "prix", aliases: ["prix de vente", "price", "prix dt", "prix tnd"], group: "Prix", help: "Prix de vente en dinars : 59,900 ou 59.9. Obligatoire pour un nouveau produit.", example: "59,900" },
  { key: "compareAt", header: "ancien_prix", aliases: ["prix barre", "ancien prix", "compare at", "prix avant"], group: "Prix", help: "Un prix réellement pratiqué avant, plus élevé. Affiché barré. 0 : retire l'ancien prix.", example: "" },
  { key: "cost", header: "cout", aliases: ["cout fournisseur", "prix achat", "prix d achat", "cost"], group: "Prix", help: "Ce que le fournisseur vous facture. Jamais affiché aux clients.", example: "32,000" },
  { key: "category", header: "categorie", aliases: ["category", "rayon", "categorie fr"], group: "Classement", help: "Nom de la catégorie. Créée si elle n'existe pas encore.", example: "Maison" },
  { key: "categoryAr", header: "categorie_ar", aliases: ["categorie arabe", "category ar"], group: "Classement", help: "Nom arabe de la catégorie, pour une catégorie créée par l'import.", example: "الدار" },
  { key: "photos", header: "photos", aliases: ["images", "photo", "image", "liens photos", "image url", "images urls"], group: "Photos", help: "Liens des photos (https://…) ou noms des fichiers choisis avec « Photos de l'ordinateur », séparés par ;. La première est la photo principale.", example: "https://exemple.com/lampe-1.jpg ; https://exemple.com/lampe-2.jpg" },
  { key: "detailPhotos", header: "images_description", aliases: ["images longues", "images de description", "detail images"], group: "Photos", help: "Grandes images verticales sous la description, mêmes règles que les photos.", example: "" },
  { key: "summary", header: "resume", aliases: ["description courte", "resume fr", "summary", "accroche"], group: "Texte", help: "Une ou deux phrases sous le nom (300 caractères au plus).", example: "Lumière douce, trois intensités, se recharge en USB-C." },
  { key: "summaryAr", header: "resume_ar", aliases: ["description courte ar", "description courte arabe", "summary ar"], group: "Texte", help: "La même chose en arabe.", example: "" },
  { key: "description", header: "description", aliases: ["description fr", "description detaillee", "details"], group: "Texte", help: "Description détaillée. Une ligne vide sépare deux paragraphes.", example: "Une lampe qui s'allume d'un simple toucher." },
  { key: "descriptionAr", header: "description_ar", aliases: ["description arabe", "description detaillee ar"], group: "Texte", help: "La même chose en arabe.", example: "" },
  { key: "specs", header: "caracteristiques", aliases: ["specs", "fiche technique", "caracteristiques fr"], group: "Texte", help: "« nom : valeur », une par ligne ou séparées par ;.", example: "Matière : plastique ; Autonomie : 8 heures" },
  { key: "specsAr", header: "caracteristiques_ar", aliases: ["specs ar", "caracteristiques arabe"], group: "Texte", help: "La même chose en arabe.", example: "" },
  { key: "keywords", header: "mots_cles", aliases: ["mots cles", "keywords", "tags", "mots cles recherche"], group: "Texte", help: "Autres noms que les clients tapent, séparés par des virgules. Jamais affichés.", example: "veilleuse, lampe de nuit, lamba" },
  { key: "variants", header: "variantes", aliases: ["options", "couleurs", "tailles", "variants"], group: "Options", help: "Noms des options, séparés par ; ou par des virgules : Noir ; Blanc.", example: "Noir ; Blanc" },
  { key: "variantsAr", header: "variantes_ar", aliases: ["options ar", "variantes arabe"], group: "Options", help: "Les mêmes noms en arabe, dans le même ordre.", example: "أكحل ; أبيض" },
  { key: "variantColors", header: "variantes_couleurs", aliases: ["couleurs hex", "codes couleur", "variantes hex", "hex"], group: "Options", help: "Couleur de chaque option en code hex, dans le même ordre : #1f2937 ; #ffffff (vide : pas de pastille).", example: "#1f2937 ; #ffffff" },
  { key: "variantPrices", header: "variantes_prix", aliases: ["prix variantes", "prix options"], group: "Options", help: "Prix propre de chaque option, dans le même ordre (vide : le prix du produit). Pas avec des offres.", example: "" },
  { key: "variantStock", header: "variantes_stock", aliases: ["stock variantes", "stock options"], group: "Options", help: "Quantité de chaque option, si vous comptez le stock.", example: "" },
  { key: "offers", header: "offres", aliases: ["lots", "offers", "packs"], group: "Offres", help: "« quantité = prix total », séparées par ; et « livraison offerte » à la fin si elle l'est : 1 = 59,900 ; 3 = 119,800 livraison offerte.", example: "1 = 59,900 ; 3 = 119,800 livraison offerte" },
  { key: "offerLabels", header: "offres_noms", aliases: ["noms offres", "offres noms fr"], group: "Offres", help: "Nom de chaque offre, dans le même ordre (vide : « 3 unités »).", example: "1 unité ; Achetez 2, la 3e offerte" },
  { key: "offerLabelsAr", header: "offres_noms_ar", aliases: ["noms offres ar", "offres arabe"], group: "Offres", help: "Les mêmes noms en arabe.", example: "حبة وحدة ; اشري 2 والثالثة هدية" },
  { key: "stock", header: "stock", aliases: ["quantite", "stock qty", "qte"], group: "Stock", help: "Un nombre si vous comptez le stock ; « fournisseur » (ou vide pour un nouveau produit) en dropshipping.", example: "fournisseur" },
  { key: "available", header: "disponible", aliases: ["dispo", "available", "disponibilite"], group: "Stock", help: "oui / non : le fournisseur peut livrer (dropshipping).", example: "oui" },
  { key: "active", header: "en_ligne", aliases: ["en ligne", "actif", "publie", "active", "visible"], group: "Publication", help: "oui / non. Vide : hors ligne pour un nouveau produit, inchangé pour un produit existant.", example: "non" },
  { key: "featured", header: "selection", aliases: ["notre selection", "mis en avant", "featured", "vedette"], group: "Publication", help: "oui / non : dans « Notre sélection » sur l'accueil.", example: "non" },
  { key: "supplier", header: "fournisseur", aliases: ["supplier", "nom fournisseur"], group: "Fournisseur", help: "Nom du fournisseur. Créé s'il n'existe pas encore.", example: "" },
  { key: "supplierRef", header: "ref_fournisseur", aliases: ["reference fournisseur", "ref", "reference", "sku"], group: "Fournisseur", help: "Sa référence du produit.", example: "" },
  { key: "supplierUrl", header: "lien_fournisseur", aliases: ["url fournisseur", "lien", "supplier url"], group: "Fournisseur", help: "Lien du produit chez le fournisseur (https://…).", example: "" },
  { key: "videoUrl", header: "video", aliases: ["lien video", "youtube", "video url"], group: "Texte", help: "Un lien YouTube, Vimeo, TikTok, Instagram ou Facebook, ou l'adresse https d'un fichier .mp4.", example: "" },
  { key: "slug", header: "adresse", aliases: ["slug", "url", "lien produit", "adresse page", "identifiant"], group: "Adresse", help: "L'adresse de la page (/produit/…). Vide : faite à partir du nom. Une adresse qui existe déjà met ce produit à jour.", example: "" },
  { key: "seoTitle", header: "titre_google", aliases: ["seo title", "titre seo"], group: "Google", help: "Vide : composé à partir du nom.", example: "" },
  { key: "seoTitleAr", header: "titre_google_ar", aliases: ["seo title ar", "titre seo ar"], group: "Google", help: "", example: "" },
  { key: "seoDescription", header: "description_google", aliases: ["seo description", "meta description"], group: "Google", help: "Vide : composée à partir de la description courte.", example: "" },
  { key: "seoDescriptionAr", header: "description_google_ar", aliases: ["seo description ar", "meta description ar"], group: "Google", help: "", example: "" },
];

/**
 * The Arabic columns. The template and the export leave them out: the owner
 * writes French only, and the Arabic is translated (during the import with an
 * API key, or afterwards). An import still reads them when a file has them.
 */
export const isArabicColumn = (k: ColumnKey) => k.endsWith("Ar");
const written = (arabic: boolean) => COLUMNS.filter((c) => arabic || !isArabicColumn(c.key));

/** "Nom (arabe)", "nom_ar", "NOM-AR" → "nomar": headers typed by hand still match. */
export function normHeader(h: string): string {
  return h.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const BY_HEADER = new Map<string, ColumnKey>();
for (const c of COLUMNS) for (const h of [c.header, c.key, ...c.aliases]) if (!BY_HEADER.has(normHeader(h))) BY_HEADER.set(normHeader(h), c.key);

/* ------------------------------------------------------------------ */
/* Reading the file                                                    */
/* ------------------------------------------------------------------ */

/**
 * The text of a file: UTF-8 when it is (Google Sheets, Excel "CSV UTF-8"),
 * otherwise Windows-1252, which is what Excel writes for "CSV" in French.
 */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** The separator of the first line: a tab (pasted from a sheet), ";" (Excel in French) or ",". */
export function detectDelimiter(text: string): string {
  let inQuotes = false;
  const counts: Record<string, number> = { "\t": 0, ";": 0, ",": 0 };
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  if (counts["\t"] > 0) return "\t";
  return counts[";"] >= counts[","] && counts[";"] > 0 ? ";" : ",";
}

/** RFC 4180: quoted cells may hold the separator, quotes ("") and line breaks. Empty lines are skipped. */
export function parseDelimited(input: string, delimiter = detectDelimiter(input)): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  const endRow = () => {
    row.push(cell);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
    cell = "";
  };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      endRow();
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else cell += ch;
    i++;
  }
  if (cell !== "" || row.length) endRow();
  return rows;
}

/* ------------------------------------------------------------------ */
/* Cells                                                               */
/* ------------------------------------------------------------------ */

const clean = (s: string) => s.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim().replace(/^'(?=[=+\-@])/, "");

const YES = new Set(["oui", "o", "yes", "y", "1", "x", "vrai", "true", "نعم", "ايه", "إيه", "on"]);
const NO = new Set(["non", "n", "no", "0", "faux", "false", "لا", "off", "-"]);
function readBool(s: string): boolean | null {
  const v = s.trim().toLowerCase();
  return YES.has(v) ? true : NO.has(v) ? false : null;
}

/** Items of a list cell: ";", "|" or line breaks; names may also be separated by commas. */
function splitList(s: string, commas: boolean): string[] {
  const t = clean(s);
  if (!t) return [];
  const strong = /[;|\n]/.test(t);
  return t.split(strong || !commas ? /\s*[;|\n]\s*/ : /\s*[,،]\s*/).map((x) => x.trim()).filter(Boolean);
}

/** Positional lists (prices, quantities, Arabic names): an empty place stays empty. */
function splitPlaces(s: string, commas: boolean): string[] {
  const t = clean(s);
  if (!t) return [];
  const strong = /[;|\n]/.test(t);
  return t.split(strong || !commas ? /[;|\n]/ : /[,،]/).map((x) => x.trim());
}

/** Picture addresses and file names. A name may contain spaces; addresses are also split where one starts. */
export function splitSources(s: string): string[] {
  return clean(s)
    .split(/\s*[;|\n]\s*/)
    .flatMap((x) => x.split(/[\s,]+(?=https?:\/\/)/))
    .map((x) => x.trim())
    .filter(Boolean);
}

export const isWebAddress = (s: string) => /^https?:\/\/[^\s]+$/i.test(s);

const FREE = /\s*(?:\+\s*)?(?:livraison\s+(?:offerte|gratuite)|free\s+delivery|توصيل\s+(?:مجاني|بلاش|هدية))\s*$/i;

export function readOffers(cell: string): { offers: OfferCell[]; errors: string[] } {
  const offers: OfferCell[] = [];
  const errors: string[] = [];
  for (const item of splitList(cell, false)) {
    const free = FREE.test(item);
    const body = item.replace(FREE, "").trim();
    const m = body.match(/^(\d{1,2})\s*(?:=|:|x|×|pour|à|a)\s*(.+)$/i);
    const price = m ? parseTND(m[2]) : null;
    if (!m || price == null || price <= 0) {
      errors.push(`Offre « ${item} » illisible : écrivez « quantité = prix total », par exemple 3 = 119,800.`);
      continue;
    }
    const quantity = Number(m[1]);
    if (quantity < 1 || quantity > 50) errors.push(`Offre « ${item} » : quantité de 1 à 50.`);
    else if (offers.some((o) => o.quantity === quantity)) errors.push(`Deux offres de ${quantity} unité(s).`);
    else offers.push({ quantity, price, freeDelivery: free });
  }
  if (offers.length > 8) errors.push("8 offres au plus.");
  return { offers: offers.slice(0, 8), errors };
}

/** Labels for an offer written without a name. */
export function autoOfferLabel(q: number): { label: string; labelAr: string } {
  return {
    label: q === 1 ? "1 unité" : `${q} unités`,
    labelAr: q === 1 ? "حبة وحدة" : q === 2 ? "زوز حبات" : q <= 10 ? `${q} حبات` : `${q} حبة`,
  };
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export type OfferCell = { quantity: number; price: number; freeDelivery: boolean; label?: string; labelAr?: string };
export type VariantCell = { name: string; nameAr?: string; colorHex?: string; price?: number | null; stockQty?: number };

/**
 * What a row says. A field left out means "not in the file, or empty":
 * a new product gets the default, an existing one keeps what it has.
 */
export type RowData = {
  slug?: string; name?: string; nameAr?: string; summary?: string; summaryAr?: string; description?: string; descriptionAr?: string;
  specs?: string; specsAr?: string; keywords?: string; videoUrl?: string;
  seoTitle?: string; seoTitleAr?: string; seoDescription?: string; seoDescriptionAr?: string;
  /** Millimes. compareAt null: remove the old price. */
  price?: number; compareAt?: number | null; cost?: number;
  category?: string; categoryAr?: string; supplier?: string; supplierRef?: string; supplierUrl?: string;
  /** A number: counted stock. null: supplier's stock (dropshipping). */
  stockQty?: number | null;
  available?: boolean; active?: boolean; featured?: boolean;
  photos?: string[]; detailPhotos?: string[];
  variants?: VariantCell[]; offers?: OfferCell[];
};

export type ParsedRow = { line: number; data: RowData; errors: string[]; warnings: string[] };
export type ParsedSheet = { rows: ParsedRow[]; columns: ColumnKey[]; unknown: string[]; error?: string };

const TEXT_MAX: Partial<Record<ColumnKey, number>> = {
  name: 140, nameAr: 140, summary: 300, summaryAr: 300, description: 8000, descriptionAr: 8000, specs: 4000, specsAr: 4000,
  keywords: 1000, videoUrl: 500, seoTitle: 120, seoTitleAr: 120, seoDescription: 320, seoDescriptionAr: 320,
  category: 60, categoryAr: 60, supplier: 80, supplierRef: 120, supplierUrl: 500, slug: 100,
};
const LABEL: Partial<Record<ColumnKey, string>> = Object.fromEntries(COLUMNS.map((c) => [c.key, c.header]));

/** The whole sheet: first line = column names, then one product per line. */
export function readSheet(text: string): ParsedSheet {
  const table = parseDelimited(text);
  if (table.length === 0) return { rows: [], columns: [], unknown: [], error: "Le fichier est vide." };
  const head = table[0].map((h) => BY_HEADER.get(normHeader(h)) ?? null);
  const unknown = table[0].filter((h, i) => h.trim() && head[i] == null).map((h) => h.trim());
  const columns = [...new Set(head.filter((k): k is ColumnKey => k != null))];
  if (!columns.includes("name") && !columns.includes("slug") && !columns.includes("nameAr")) {
    return { rows: [], columns, unknown, error: "La première ligne doit donner les noms des colonnes, avec au moins « nom » (ou « adresse » pour mettre à jour). Téléchargez le modèle pour voir le format." };
  }
  if (table.length - 1 > MAX_ROWS) return { rows: [], columns, unknown, error: `${table.length - 1} lignes : ${MAX_ROWS} au plus par import. Coupez le fichier en plusieurs.` };
  const rows = table.slice(1).map((cells, i) => {
    const cellOf: Partial<Record<ColumnKey, string>> = {};
    head.forEach((k, j) => {
      // The first column of a name wins; a second "photos" column adds to it.
      if (!k) return;
      const v = cells[j] ?? "";
      cellOf[k] = cellOf[k] && v.trim() ? (k === "photos" || k === "detailPhotos" ? `${cellOf[k]};${v}` : cellOf[k]) : (cellOf[k] || v);
    });
    return readRow(cellOf, i + 2);
  });
  return { rows, columns, unknown };
}

export const MAX_ROWS = 2000;

export function readRow(cell: Partial<Record<ColumnKey, string>>, line: number): ParsedRow {
  const d: RowData = {};
  const errors: string[] = [];
  const warnings: string[] = [];
  const text = (k: ColumnKey): string | undefined => {
    const v = cell[k] == null ? "" : clean(cell[k]!);
    if (!v) return undefined;
    const max = TEXT_MAX[k] ?? 8000;
    if (v.length > max) {
      errors.push(`« ${LABEL[k]} » : ${v.length} caractères, ${max} au plus.`);
      return v.slice(0, max);
    }
    return v;
  };
  const money = (k: ColumnKey): number | undefined => {
    const v = text(k);
    if (v == null) return undefined;
    const m = parseTND(v);
    if (m == null) errors.push(`« ${LABEL[k]} » illisible : « ${v} » (écrivez par exemple 59,900).`);
    return m ?? undefined;
  };
  const bool = (k: ColumnKey): boolean | undefined => {
    const v = text(k);
    if (v == null) return undefined;
    const b = readBool(v);
    if (b == null) errors.push(`« ${LABEL[k]} » : écrivez oui ou non (pas « ${v} »).`);
    return b ?? undefined;
  };

  for (const k of ["slug", "name", "nameAr", "summary", "summaryAr", "description", "descriptionAr", "keywords", "videoUrl", "seoTitle", "seoTitleAr", "seoDescription", "seoDescriptionAr", "category", "categoryAr", "supplier", "supplierRef", "supplierUrl"] as const) {
    const v = text(k);
    if (v != null) d[k] = k === "summary" || k === "summaryAr" || k === "name" || k === "nameAr" || k.startsWith("seo") || k === "category" || k === "categoryAr" || k === "supplier" ? v.replace(/\s*\n\s*/g, " ") : v;
  }
  // "nom : valeur ; nom : valeur" or one per line: the shop reads one per line.
  for (const k of ["specs", "specsAr"] as const) {
    const v = text(k);
    if (v != null) d[k] = splitList(v, false).join("\n");
  }
  if (d.slug != null) {
    const s = slugify(d.slug.replace(/^.*\/produit\//, ""));
    if (!s) errors.push(`« adresse » : « ${d.slug} » ne donne pas d'adresse (lettres latines, chiffres et tirets).`);
    d.slug = s || undefined;
  }
  if (d.supplierUrl != null && !isWebAddress(d.supplierUrl)) {
    warnings.push("« lien_fournisseur » ignoré : ce n'est pas une adresse https://…");
    delete d.supplierUrl;
  }

  d.price = money("price");
  if (d.price === 0) errors.push("« prix » : 0 DT n'est pas un prix.");
  const compareAt = money("compareAt");
  if (compareAt !== undefined) d.compareAt = compareAt === 0 ? null : compareAt;
  d.cost = money("cost");

  const stock = text("stock");
  if (stock != null) {
    if (/^\d+$/.test(stock)) d.stockQty = Math.min(Number(stock), 1_000_000);
    else if (/^(fournisseur|dropshipping|supplier|fournisseurs?|dispo fournisseur)$/i.test(stock)) d.stockQty = null;
    else errors.push(`« stock » : un nombre, ou « fournisseur » (pas « ${stock} »).`);
  }
  d.available = bool("available");
  d.active = bool("active");
  d.featured = bool("featured");

  for (const k of ["photos", "detailPhotos"] as const) {
    const v = cell[k];
    if (!v?.trim()) continue;
    const list = [...new Set(splitSources(v))];
    if (list.length > 30) warnings.push(`« ${LABEL[k]} » : ${list.length} images, les 30 premières sont gardées.`);
    d[k] = list.slice(0, 30);
  }

  const names = cell.variants?.trim() ? splitList(cell.variants, true) : [];
  if (names.length) {
    const ar = splitPlaces(cell.variantsAr ?? "", true);
    const prices = splitPlaces(cell.variantPrices ?? "", false);
    const stocks = splitPlaces(cell.variantStock ?? "", true);
    const colors = splitPlaces(cell.variantColors ?? "", true);
    if (ar.length && ar.length !== names.length) warnings.push(`« variantes_ar » : ${ar.length} noms pour ${names.length} options.`);
    if (prices.length && prices.length !== names.length) warnings.push(`« variantes_prix » : ${prices.length} prix pour ${names.length} options.`);
    if (names.length > 60) errors.push("60 options au plus.");
    const seen = new Set<string>();
    d.variants = names.slice(0, 60).map((name, i) => {
      if (name.length > 60) errors.push(`Option « ${name.slice(0, 20)}… » : 60 caractères au plus.`);
      if (seen.has(name.toLowerCase())) errors.push(`L'option « ${name} » apparaît deux fois.`);
      seen.add(name.toLowerCase());
      const v: VariantCell = { name: name.slice(0, 60) };
      if (ar[i]) v.nameAr = ar[i].slice(0, 60);
      if (colors[i]) {
        const hex = readHex(colors[i]);
        if (hex) v.colorHex = hex;
        else errors.push(`Couleur de l'option « ${name} » : un code comme #1f2937 (pas « ${colors[i]} »).`);
      }
      if (cell.variantPrices?.trim()) {
        const p = prices[i] ? parseTND(prices[i]) : null;
        if (prices[i] && p == null) errors.push(`Prix de l'option « ${name} » illisible : « ${prices[i]} ».`);
        v.price = p;
      }
      if (stocks[i]) {
        if (/^\d+$/.test(stocks[i])) v.stockQty = Math.min(Number(stocks[i]), 1_000_000);
        else errors.push(`Stock de l'option « ${name} » : un nombre (pas « ${stocks[i]} »).`);
      }
      return v;
    });
  } else if (cell.variantsAr?.trim() || cell.variantPrices?.trim() || cell.variantColors?.trim()) warnings.push("Noms arabes, couleurs ou prix d'options sans « variantes » : ignorés.");

  if (cell.offers?.trim()) {
    const r = readOffers(cell.offers);
    errors.push(...r.errors);
    const labels = splitPlaces(cell.offerLabels ?? "", false);
    const labelsAr = splitPlaces(cell.offerLabelsAr ?? "", false);
    d.offers = r.offers.map((o, i) => ({ ...o, ...(labels[i] ? { label: labels[i].slice(0, 80) } : {}), ...(labelsAr[i] ? { labelAr: labelsAr[i].slice(0, 80) } : {}) }));
    if (d.offers.length && d.variants?.some((v) => v.price != null)) errors.push("Des offres et des options à prix propre ne vont pas ensemble : les offres utilisent le prix du produit.");
  }

  if (!d.name && !d.slug) errors.push(d.nameAr ? "Nom en français manquant : il est obligatoire (le nom arabe seul ne suffit pas)." : "Ni nom ni adresse : la ligne ne dit pas quel produit.");
  if (d.compareAt != null && d.price != null && d.compareAt <= d.price) errors.push("L'ancien prix doit être plus élevé que le prix.");
  return { line, data: d, errors, warnings };
}

/** The address a row is saved under: the one it gives, or the one made from its name. */
export function rowKey(d: RowData): string {
  return d.slug || slugify(d.name ?? "");
}

/* ------------------------------------------------------------------ */
/* A row onto a product                                                */
/* ------------------------------------------------------------------ */

export const EMPTY_PRODUCT: ProductInput = {
  name: "", nameAr: "", slug: "", summary: "", summaryAr: "", description: "", descriptionAr: "", specs: "", specsAr: "", videoUrl: "", keywords: "",
  seoTitle: "", seoTitleAr: "", seoDescription: "", seoDescriptionAr: "", price: 0, compareAt: null, cost: null, categoryId: null, supplierId: null,
  supplierRef: "", supplierUrl: "", stockMode: "SUPPLIER", stockQty: 0, available: true, active: false, featured: false, variants: [], offers: [],
};

const PAIRS = [["name", "nameAr"], ["summary", "summaryAr"], ["description", "descriptionAr"], ["specs", "specsAr"], ["seoTitle", "seoTitleAr"], ["seoDescription", "seoDescriptionAr"]] as const;
/** Spaces and line endings a spreadsheet changes do not count as a change. */
const differs = (a: string, b: string) => a.replace(/\s+/g, " ").trim() !== b.replace(/\s+/g, " ").trim();

const TEXT_KEYS = ["name", "nameAr", "summary", "summaryAr", "description", "descriptionAr", "specs", "specsAr", "keywords", "videoUrl", "seoTitle", "seoTitleAr", "seoDescription", "seoDescriptionAr", "supplierRef", "supplierUrl"] as const;

/**
 * The product as it will be saved: what the row gives, over what the product
 * already has (or the defaults for a new one). Options and offers are matched
 * by name and by quantity, so the ones already there keep their history.
 */
export function mergeRow(base: ProductInput | null, d: RowData, refs: { categoryId?: string | null; supplierId?: string | null }, activateNew = false): ProductInput {
  const p: ProductInput = { ...(base ?? EMPTY_PRODUCT), variants: [...(base?.variants ?? [])], offers: [...(base?.offers ?? [])] };
  for (const k of TEXT_KEYS) if (d[k] !== undefined) p[k] = d[k]!;
  // A French text changed by a sheet without its Arabic: the old Arabic no longer says the same thing, it is translated again.
  if (base) for (const [fr, ar] of PAIRS) if (d[fr] !== undefined && d[ar] === undefined && differs(base[fr], d[fr]!)) p[ar] = "";
  p.slug = base?.slug || rowKey(d);
  if (d.price !== undefined) p.price = d.price;
  if (d.compareAt !== undefined) p.compareAt = d.compareAt;
  if (d.cost !== undefined) p.cost = d.cost;
  if (refs.categoryId !== undefined) p.categoryId = refs.categoryId;
  if (refs.supplierId !== undefined) p.supplierId = refs.supplierId;
  if (d.stockQty === null) p.stockMode = "SUPPLIER";
  else if (d.stockQty !== undefined) {
    p.stockMode = "TRACKED";
    p.stockQty = d.stockQty;
  }
  if (d.available !== undefined) p.available = d.available;
  if (d.featured !== undefined) p.featured = d.featured;
  p.active = d.active ?? (base ? base.active : activateNew);

  if (d.variants) {
    const old = new Map((base?.variants ?? []).map((v) => [v.name.trim().toLowerCase(), v]));
    p.variants = d.variants.map((v) => {
      const was = old.get(v.name.toLowerCase());
      return {
        ...(was?.id ? { id: was.id } : {}),
        name: v.name,
        nameAr: v.nameAr ?? was?.nameAr ?? "",
        colorHex: v.colorHex ?? was?.colorHex ?? "",
        sku: was?.sku ?? "",
        price: v.price !== undefined ? v.price : (was?.price ?? null),
        stockQty: v.stockQty ?? was?.stockQty ?? 0,
        available: was?.available ?? true,
      };
    });
  }
  if (d.offers) {
    const old = new Map((base?.offers ?? []).map((o) => [o.quantity, o]));
    p.offers = d.offers.map((o) => {
      const was = old.get(o.quantity);
      const auto = autoOfferLabel(o.quantity);
      return {
        ...(was?.id ? { id: was.id } : {}),
        label: o.label ?? was?.label ?? auto.label,
        labelAr: o.labelAr ?? (o.label !== undefined && was && differs(was.label, o.label) ? "" : (was?.labelAr ?? auto.labelAr)),
        quantity: o.quantity,
        price: o.price,
        freeDelivery: o.freeDelivery,
        endsOn: was?.endsOn ?? "",
        active: was?.active ?? true,
      };
    });
  }
  return p;
}

/* ------------------------------------------------------------------ */
/* Writing the catalog                                                 */
/* ------------------------------------------------------------------ */

export type ExportProduct = ProductInput & {
  category: { name: string; nameAr: string | null } | null;
  supplier: string | null;
  photos: string[];
  detailPhotos: string[];
};

const money = (m: number | null | undefined) => (m == null ? "" : (m / 1000).toFixed(3).replace(".", ","));
const yesNo = (b: boolean) => (b ? "oui" : "non");
/** A cell that a spreadsheet would run as a formula ("=…", "+…", "-…", "@…") is written with a leading apostrophe; reading strips it again. */
const FORMULA = /^[=+\-@\t\r]/;
const quote = (raw: string, sep: string) => {
  const v = FORMULA.test(raw) ? `'${raw}` : raw;
  return /["\n\r]/.test(v) || v.includes(sep) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/** The catalog in the import format, ";"-separated with a BOM so Excel in French opens it with its accents (and the Arabic, when asked). */
export function productsToCsv(products: ExportProduct[], sep = ";", { arabic = false } = {}): string {
  const cols = written(arabic);
  const keys = cols.map((c) => c.key);
  const lines = [cols.map((c) => c.header).join(sep)];
  for (const p of products) {
    const ownPrices = p.variants.some((v) => v.price != null);
    const counted = p.stockMode === "TRACKED";
    const cell: Record<ColumnKey, string> = {
      slug: p.slug, name: p.name, nameAr: p.nameAr, summary: p.summary, summaryAr: p.summaryAr, description: p.description, descriptionAr: p.descriptionAr,
      specs: p.specs, specsAr: p.specsAr, keywords: p.keywords, price: money(p.price), compareAt: money(p.compareAt), cost: money(p.cost),
      category: p.category?.name ?? "", categoryAr: p.category?.nameAr ?? "", supplier: p.supplier ?? "", supplierRef: p.supplierRef, supplierUrl: p.supplierUrl,
      stock: counted ? String(p.stockQty) : "fournisseur", available: yesNo(p.available), active: yesNo(p.active), featured: yesNo(p.featured),
      photos: p.photos.join(" ; "), detailPhotos: p.detailPhotos.join(" ; "), videoUrl: p.videoUrl,
      variants: p.variants.map((v) => v.name).join(" ; "), variantsAr: p.variants.some((v) => v.nameAr) ? p.variants.map((v) => v.nameAr ?? "").join(" ; ") : "",
      variantColors: p.variants.some((v) => v.colorHex) ? p.variants.map((v) => v.colorHex ?? "").join(" ; ") : "",
      variantPrices: ownPrices ? p.variants.map((v) => money(v.price)).join(" ; ") : "",
      variantStock: counted && p.variants.length ? p.variants.map((v) => String(v.stockQty)).join(" ; ") : "",
      offers: p.offers.map((o) => `${o.quantity} = ${money(o.price)}${o.freeDelivery ? " livraison offerte" : ""}`).join(" ; "),
      offerLabels: p.offers.map((o) => o.label).join(" ; "), offerLabelsAr: p.offers.map((o) => o.labelAr).join(" ; "),
      seoTitle: p.seoTitle, seoTitleAr: p.seoTitleAr, seoDescription: p.seoDescription, seoDescriptionAr: p.seoDescriptionAr,
    };
    lines.push(keys.map((k) => quote(cell[k] ?? "", sep)).join(sep));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** The empty template, or the template with two filled example lines. */
export function templateCsv(withExamples: boolean, sep = ";", { arabic = false } = {}): string {
  const cols = written(arabic);
  const lines = [cols.map((c) => c.header).join(sep)];
  if (withExamples) {
    lines.push(cols.map((c) => quote(c.example, sep)).join(sep));
    const second: Partial<Record<ColumnKey, string>> = {
      name: "Diffuseur d'huiles essentielles 300 ml", price: "79,000", cost: "41,500", category: "Maison", categoryAr: "الدار",
      photos: "diffuseur-1.jpg ; diffuseur-2.jpg", summary: "Brume fine, sept couleurs, arrêt automatique.", stock: "12", active: "non", available: "oui", featured: "non",
    };
    lines.push(cols.map((c) => quote(second[c.key] ?? "", sep)).join(sep));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
