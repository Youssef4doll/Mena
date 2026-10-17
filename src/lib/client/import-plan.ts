/**
 * The CSV import seen from the browser before anything is sent: which row
 * creates a product and which updates one, which pictures each row sends and
 * from where, what the import will add to the database. Pure functions, so
 * the preview and the run read the same plan.
 */
import { isWebAddress, mergeRow, normHeader, rowKey, type ParsedRow, type RowData } from "../product-csv";
import { needsTranslation, textsOfProduct, type ProductTexts } from "../translate-merge";

export type Kind = "GALLERY" | "DETAIL";

/** One picture of a row: a web address, or a file chosen from the computer. `index` is its place in its cell. */
export type Picture = { kind: Kind; index: number; label: string; url?: string; file?: File };

export type Existing = Record<string, { id: string; name: string }>;

export type PlannedRow = {
  line: number;
  data: RowData;
  key: string;
  status: "new" | "update" | "error";
  existing?: { id: string; name: string };
  pictures: Picture[];
  /** Names in the photo cells that match no chosen file. */
  missing: string[];
  errors: string[];
  warnings: string[];
};

/* ------------------------------------------------------------------ */
/* Photos from the computer                                            */
/* ------------------------------------------------------------------ */

export type FileIndex = { byName: Map<string, File>; byStem: Map<string, File>; count: number };

const stem = (name: string) => name.replace(/\.[^./\\]+$/, "");
/** "Photos/lampe-1.JPG" → "lampe-1.jpg": a cell may give the folder too. */
const fileName = (s: string) => (s.trim().split(/[\\/]/).pop() ?? "").toLowerCase();

/** A folder holds other files too: only pictures are kept. */
export const isPicture = (f: { name: string; type: string }) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|avif|gif|heic|heif)$/i.test(f.name);

/** The chosen files by name, without case. When two files share a name, the first one chosen wins. */
export function indexFiles(files: File[]): FileIndex {
  const byName = new Map<string, File>();
  const byStem = new Map<string, File>();
  for (const f of files) {
    const n = f.name.toLowerCase();
    if (!byName.has(n)) byName.set(n, f);
    if (!byStem.has(stem(n))) byStem.set(stem(n), f);
  }
  return { byName, byStem, count: byName.size };
}

/** "Lampe-1.JPG", "lampe-1" or "lampe-1.png" all find lampe-1.jpg. */
export function findFile(index: FileIndex, cell: string): File | undefined {
  const n = fileName(cell);
  if (!n) return undefined;
  return index.byName.get(n) ?? index.byStem.get(n) ?? index.byStem.get(stem(n));
}

/** A picture of this shop, as an export lists it: linked again by the server, nothing is copied. */
export const isOwnPicture = (url: string) => /\/api\/img\/[a-z0-9]{20,40}\/\d+\/?$/.test(url);

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

/** The highest amount the server takes for a price, an old price, a cost, an option or an offer: 100 000 DT. */
const MAX_AMOUNT = 100_000_000;

/** What the server would refuse without a clear word, said in the preview instead. */
function refusals(d: RowData, key: string): string[] {
  const out: string[] = [];
  // An Arabic-only name gives no address, and the address is how the row finds its product.
  if (d.name && !key) out.push("Le nom ne donne pas d'adresse de page (il faut des lettres latines) : écrivez le nom en français, ou remplissez « adresse ».");
  if (d.name != null && d.name.trim().length < 2) out.push("« nom » : 2 caractères au moins.");
  const amounts = [d.price, d.compareAt, d.cost, ...(d.variants ?? []).map((v) => v.price), ...(d.offers ?? []).map((o) => o.price)];
  if (amounts.some((m) => m != null && m > MAX_AMOUNT)) out.push("Montant trop élevé : 100 000 DT au plus.");
  return out;
}

/**
 * Each row with what will happen to it. A row that names the same product as
 * an earlier row is an error: the second would silently overwrite the first.
 */
export function planRows(rows: ParsedRow[], existing: Existing, files: FileIndex): PlannedRow[] {
  const lineOfKey = new Map<string, number>();
  const lineOfId = new Map<string, number>();
  return rows.map((r) => {
    const key = rowKey(r.data);
    const found = key ? existing[key] : undefined;
    const errors = [...r.errors, ...refusals(r.data, key)];
    const first = (key ? lineOfKey.get(key) : undefined) ?? (found ? lineOfId.get(found.id) : undefined);
    if (first) errors.push(`Même produit que la ligne ${first}.`);
    if (key && !lineOfKey.has(key)) lineOfKey.set(key, r.line);
    if (found && !lineOfId.has(found.id)) lineOfId.set(found.id, r.line);
    if (key && !found) {
      if (!r.data.name) errors.push(`Aucun produit à l'adresse « ${key} », et un nouveau produit a besoin d'un nom en français.`);
      else if (r.data.price == null) errors.push("Nouveau produit sans prix.");
    }

    const pictures: Picture[] = [];
    const missing: string[] = [];
    for (const [kind, list] of [["GALLERY", r.data.photos], ["DETAIL", r.data.detailPhotos]] as const) {
      // "lampe-1" and "Lampe-1.JPG" in one cell are the same file: sent twice at once, both would be stored.
      const seen = new Set<File>();
      (list ?? []).forEach((s, index) => {
        if (isWebAddress(s)) return pictures.push({ kind, index, label: s, url: s });
        const file = findFile(files, s);
        if (!file) missing.push(s);
        else if (!seen.has(file)) {
          seen.add(file);
          pictures.push({ kind, index, label: s, file });
        }
      });
    }
    return { line: r.line, data: r.data, key, status: errors.length ? "error" : found ? "update" : "new", existing: found, pictures, missing, errors, warnings: r.warnings };
  });
}

/** Per kind of picture, for the estimate: a gallery photo is stored at about 150 KB, a long description image at about 500 KB. */
const ESTIMATE: Record<Kind, number> = { GALLERY: 150 * 1024, DETAIL: 500 * 1024 };

export type PlanSummary = { lines: number; created: number; updated: number; errors: number; pictures: number; bytes: number; missing: number };

/** The counts above the preview. Pictures of this shop (an exported file) add nothing and are left out of the estimate. */
export function summarize(plan: PlannedRow[]): PlanSummary {
  const s: PlanSummary = { lines: plan.length, created: 0, updated: 0, errors: 0, pictures: 0, bytes: 0, missing: 0 };
  for (const r of plan) {
    if (r.status === "error") {
      s.errors++;
      continue;
    }
    if (r.status === "new") s.created++;
    else s.updated++;
    s.missing += r.missing.length;
    for (const p of r.pictures) {
      if (p.url && isOwnPicture(p.url)) continue;
      s.pictures++;
      s.bytes += ESTIMATE[p.kind];
    }
  }
  return s;
}

/**
 * The new categories (or suppliers) the import really uses: the ones of rows
 * that will be imported, once each whatever the case, with the Arabic name of
 * the first row that gives one.
 */
export function namesToCreate(plan: PlannedRow[], fresh: string[], field: "category" | "supplier"): { name: string; nameAr?: string }[] {
  const wanted = new Set(fresh.map(normHeader));
  const out = new Map<string, { name: string; nameAr?: string }>();
  for (const r of plan) {
    const name = r.data[field];
    if (r.status === "error" || !name || !wanted.has(normHeader(name))) continue;
    const k = normHeader(name);
    const was = out.get(k);
    const ar = field === "category" ? r.data.categoryAr : undefined;
    if (!was) out.set(k, ar ? { name, nameAr: ar } : { name });
    else if (ar && !was.nameAr) was.nameAr = ar;
  }
  return [...out.values()];
}

/* ------------------------------------------------------------------ */
/* After the import                                                    */
/* ------------------------------------------------------------------ */

/** The texts a product created from this row starts with (the offers get their automatic labels, Arabic included). */
export function textsOfRow(d: RowData): ProductTexts {
  return textsOfProduct(mergeRow(null, d, {}));
}

/** Something for the translation to do: a text in one language only, or no search keywords yet. */
export const rowNeedsTranslation = (d: RowData) => needsTranslation(textsOfRow(d));

/** A French text whose Arabic is empty (as opposed to only the keywords missing). */
export function lacksArabic(t: ProductTexts): boolean {
  const gap = (fr: string | undefined, ar: string | undefined) => Boolean(fr?.trim()) && !ar?.trim();
  return (
    gap(t.name, t.nameAr) || gap(t.summary, t.summaryAr) || gap(t.description, t.descriptionAr) || gap(t.specs, t.specsAr) ||
    t.variants.some((v) => gap(v.name, v.nameAr)) || t.offers.some((o) => gap(o.label, o.labelAr))
  );
}

/** "1,4 Mo", "12 Mo", "0,6 Go". */
export function formatSize(bytes: number): string {
  const mo = bytes / 1024 / 1024;
  if (mo >= 1024) return `${(mo / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go`;
  return `${mo.toLocaleString("fr-FR", { maximumFractionDigits: mo < 10 ? 1 : 0 })} Mo`;
}

/** "45 s", "3 min 05 s", "1 h 02 min". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min`;
}
