/**
 * Reading what Meta Ads Manager and TikTok Ads Manager export, so the owner
 * can drop the file instead of retyping spend, impressions and clicks. Pure:
 * the browser runs it for the preview, and the server checks the rows again
 * before saving them.
 *
 * Exports come in many shapes: French or English column names, commas or
 * semicolons (a file opened and saved again in French Excel), numbers written
 * "1 234,56" or "1,234.56", a total row at the top or the bottom, one line
 * per age group or placement. Whatever cannot be read safely is refused with
 * the reason, never guessed: a wrong currency or a misread decimal would make
 * every cost on the ads page false.
 */
import { decodeText, detectDelimiter, normHeader, parseDelimited } from "../product-csv";
import { spendInRange } from "../profit";
import { META_SOURCE, normName, spendSource } from "./match";

export { decodeText };

/** One spend row as it is saved: money in millimes, counts as the platform gave them (null: not in the file). */
export type SpendRow = {
  /** First day covered, YYYY-MM-DD. */
  day: string;
  /** Days covered from `day` on (1 for a daily export). */
  days: number;
  source: string;
  campaign: string | null;
  adSet: string | null;
  ad: string | null;
  /**
   * The ad account (its ID, else its name) when the export has the column.
   * Not a column of its own: the import key carries it, which keeps two
   * accounts' campaigns of the same name apart.
   */
  account: string | null;
  amount: number;
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  purchases: number | null;
};

/** A row of the preview: where it starts in the file, and how many lines were added up into it. */
export type ExportRow = SpendRow & { line: number; lines: number };

export type Platform = "meta" | "tiktok";

export type ExportOptions = {
  /** Forces the source written on every row ("snapchat"…). Default: from the platform. A Meta app gives "facebook" (spendSource). */
  source?: string;
  /** The account's currency, when the file does not say it. */
  currency?: string;
  /** Dinars paid for one unit of a foreign currency (bank rate, fees included). */
  rate?: number;
};

export type PlatformExport = {
  platform: Platform | null;
  source: string | null;
  currency: string | null;
  rows: ExportRow[];
  skipped: { line: number; reason: string }[];
  warnings: string[];
  /** Which column was read for each figure, as written in the file. */
  columns: Partial<Record<Field, string>>;
  /** Spend of all rows (millimes) and the days they cover. */
  total: { amount: number; from: string | null; to: string | null };
  error?: string;
  /** What the owner must give for the file to be read. */
  needs?: "source" | "currency" | "rate";
};

/** Above this, the export should be split (by month): the import is one request. */
export const MAX_EXPORT_ROWS = 5000;
/** The longest period one row may cover, as on the manual spend page. */
export const MAX_ROW_DAYS = 92;
/** Names are cut where the site cuts utm_campaign and utm_content, so they still match. */
const NAME_MAX = 120;

type Field =
  | "accountId" | "accountName" | "campaign" | "adSet" | "ad" | "day" | "starts" | "ends" | "amount"
  | "impressions" | "clicks" | "reach" | "purchases" | "results" | "resultIndicator" | "currency";

/**
 * Column names in both languages, as the two managers write them. Exact names
 * only (after removing accents, case and punctuation): "Clicks (all)" or
 * "Cost per result" must not be read as link clicks or spend.
 */
const COLUMNS: { field: Field; en: string[]; fr: string[] }[] = [
  { field: "accountId", en: ["Account ID", "Advertiser ID"], fr: ["Identifiant du compte", "ID du compte", "ID de l'annonceur"] },
  { field: "accountName", en: ["Account name", "Advertiser name"], fr: ["Nom du compte", "Nom de l'annonceur"] },
  { field: "campaign", en: ["Campaign name", "Campaign"], fr: ["Nom de la campagne", "Nom de campagne", "Campagne"] },
  { field: "adSet", en: ["Ad set name", "Ad set", "Ad group name", "Ad group"], fr: ["Nom de l'ensemble de publicités", "Ensemble de publicités", "Nom du groupe d'annonces", "Groupe d'annonces", "Nom du groupe de publicités"] },
  { field: "ad", en: ["Ad name", "Ad"], fr: ["Nom de la publicité", "Publicité", "Nom de l'annonce", "Annonce"] },
  { field: "day", en: ["Day", "Date", "By day", "Stat time day"], fr: ["Jour", "Date", "Par jour"] },
  { field: "starts", en: ["Reporting starts", "Start date", "Starts"], fr: ["Début des rapports", "Début du rapport", "Date de début", "Début"] },
  { field: "ends", en: ["Reporting ends", "End date", "Ends"], fr: ["Fin des rapports", "Fin du rapport", "Date de fin", "Fin"] },
  { field: "amount", en: ["Amount spent", "Cost", "Total cost", "Spend", "Spent"], fr: ["Montant dépensé", "Coût", "Coût total", "Dépenses", "Dépense"] },
  { field: "impressions", en: ["Impressions"], fr: ["Impressions"] },
  { field: "clicks", en: ["Link clicks", "Clicks (destination)", "Destination clicks", "Clicks"], fr: ["Clics sur un lien", "Clics sur le lien", "Clics (destination)", "Clics vers la destination", "Clics"] },
  { field: "reach", en: ["Reach"], fr: ["Couverture", "Portée"] },
  { field: "purchases", en: ["Purchases", "Website purchases", "Purchase", "Complete payment", "Complete payments"], fr: ["Achats", "Achats sur le site web", "Achat", "Paiement effectué", "Paiements effectués", "Paiement complet", "Paiements complets"] },
  { field: "results", en: ["Results"], fr: ["Résultats"] },
  { field: "resultIndicator", en: ["Result indicator", "Result type"], fr: ["Indicateur de résultat", "Indicateur de résultats", "Type de résultat"] },
  { field: "currency", en: ["Currency"], fr: ["Devise"] },
];

const HEADERS = new Map<string, { field: Field; lang: "fr" | "en" | null }>();
for (const c of COLUMNS) {
  for (const [lang, names] of [["en", c.en], ["fr", c.fr]] as const) {
    for (const name of names) {
      const k = normHeader(name);
      const prev = HEADERS.get(k);
      // A name both managers use ("Impressions", "Date") says nothing about the language.
      HEADERS.set(k, { field: c.field, lang: prev && prev.lang !== lang ? null : lang });
    }
  }
}

/** Columns only one of the two managers writes: enough to tell which file it is. */
const META_ONLY = new Set(["Ad set name", "Nom de l'ensemble de publicités", "Amount spent", "Montant dépensé", "Reporting starts", "Début des rapports", "Link clicks", "Clics sur un lien", "Result indicator", "Indicateur de résultat"].map(normHeader));
const TIKTOK_ONLY = new Set(["Ad group name", "Nom du groupe d'annonces", "Clicks (destination)", "Clics (destination)", "Complete payment", "Paiement effectué", "Paiement complet", "Cost", "Coût", "Stat time day"].map(normHeader));
const SOURCE_OF: Record<Platform, string> = { meta: META_SOURCE, tiktok: "tiktok" };

/**
 * What a column holds. "Amount spent (TND)" is the spend, in dinars; the
 * bracket is only read as a currency on a spend column, so "Clicks (all)"
 * stays an unknown column instead of becoming link clicks.
 */
function headerField(header: string): { field: Field; lang: "fr" | "en" | null; currency: string | null } | null {
  const whole = HEADERS.get(normHeader(header));
  if (whole) return { ...whole, currency: null };
  const m = header.match(/^(.*?)\s*[([]\s*([A-Za-z]{2,3})\s*[)\]]\s*$/);
  const hit = m ? HEADERS.get(normHeader(m[1])) : undefined;
  return m && hit?.field === "amount" ? { ...hit, currency: currencyCode(m[2]) } : null;
}

function currencyCode(s: string): string | null {
  const v = s.trim().toUpperCase();
  if (v === "" || v === "-") return null;
  return v === "DT" || v === "د.ت" ? "TND" : v;
}

/* ------------------------------------------------------------------ */
/* Cells                                                               */
/* ------------------------------------------------------------------ */

const text = (s: string | undefined) => (s ?? "").replace(/[\u00a0\u202f\u2009]/g, " ").trim();
const NONE = new Set(["-", "—", "–", "n/a", "na", "null"]);

function readName(s: string | undefined): string | null {
  const v = text(s);
  if (v === "" || NONE.has(v.toLowerCase())) return null;
  return v.slice(0, NAME_MAX);
}

/** "Total", "Total of 3 campaigns", "Totaux", "Summary": the platform's own sum, not a row. */
const TOTAL = /^(total|totaux|summary|résumé)(?![a-z])/i;

/** Digits, separators and a minus sign; currency signs and spaces (thousands in French) removed. */
function numberText(s: string): string {
  return s
    .replace(/د\.ت/g, "")
    .replace(/\b(TND|DT|USD|EUR)\b/gi, "")
    .replace(/[\s']/g, "")
    .replace(/[^\d.,-]/g, "");
}

type NumberStyle = { decimal: "," | "."; thousands: "," | "." | null };

/**
 * How the file writes numbers, from the cells themselves: "1 234,56" or
 * "12,5" show a decimal comma, "1,234.56" a decimal point. A cell like
 * "1,234" proves nothing; then the language of the columns decides (French
 * files write a decimal comma). A French file never groups thousands with a
 * dot, so "12.500" there is twelve and a half.
 */
function numberStyle(cells: string[], french: boolean): NumberStyle {
  const dec = { ",": 0, ".": 0 };
  const thou = { ",": 0, ".": 0 };
  for (const cell of cells) {
    const c = numberText(cell);
    const hasComma = c.includes(",");
    const hasDot = c.includes(".");
    if (hasComma && hasDot) {
      const last = c.lastIndexOf(",") > c.lastIndexOf(".") ? "," : ".";
      dec[last]++;
      thou[last === "," ? "." : ","]++;
    } else if (hasComma || hasDot) {
      const sep = hasComma ? "," : ".";
      const parts = c.split(sep);
      if (parts.length > 2) thou[sep]++;
      else if (parts[1].length !== 3) dec[sep]++;
    }
  }
  const decimal: "," | "." =
    dec[","] !== dec["."] ? (dec[","] > dec["."] ? "," : ".") : thou[","] !== thou["."] ? (thou[","] > thou["."] ? "." : ",") : french ? "," : ".";
  const other = decimal === "," ? "." : ",";
  const thousands = thou[other] > 0 ? other : decimal === "." && !french ? "," : null;
  return { decimal, thousands };
}

/**
 * A number cell. Undefined when it is not a number; null when it is empty
 * or a dash (the platform gave nothing). Counts are whole: in a count,
 * "1,234" or "1.234" is a thousand and more, never one and a bit.
 */
function readNumber(cell: string | undefined, style: NumberStyle, whole: boolean): number | null | undefined {
  const raw = text(cell);
  if (raw === "" || NONE.has(raw.toLowerCase())) return null;
  const c = numberText(raw);
  if (!/\d/.test(c) || !/^-?[\d.,]+$/.test(c)) return undefined;
  let s = c;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    const last = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    s = s.split(last === "," ? "." : ",").join("").replace(",", ".");
  } else if (hasComma || hasDot) {
    const sep = hasComma ? "," : ".";
    const parts = s.split(sep);
    const grouped = parts.length > 2 || ((sep === style.thousands || whole) && parts[1].length === 3 && /^-?[1-9]\d{0,2}$/.test(parts[0]));
    s = grouped ? parts.join("") : `${parts[0]}.${parts[1]}`;
  }
  const v = Number(s);
  if (!Number.isFinite(v)) return undefined;
  return whole ? Math.round(v) : v;
}

/** YYYY-MM-DD of a real calendar day, or null. */
function ymd(y: number, m: number, d: number): string | null {
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  if (y < 2000 || y > 2100 || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

const ISO_DAY = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/;
const LOCAL_DAY = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?:$|\s)/;

/** "2026-10-12", "2026-10-12 00:00:00", "12/10/2026" or "12/10/26" (day first unless the file shows otherwise). */
function readDay(cell: string | undefined, monthFirst: boolean): string | null | undefined {
  const v = text(cell);
  if (v === "") return null;
  let m = v.match(ISO_DAY);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3])) ?? undefined;
  m = v.match(LOCAL_DAY);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return (monthFirst ? ymd(y, a, b) : ymd(y, b, a)) ?? undefined;
  }
  return undefined;
}

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
const addDays = (a: string, n: number) => new Date(Date.parse(`${a}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

const PURCHASE_RESULT = /purchase|achat|complete_?payment|paiement/i;

/* ------------------------------------------------------------------ */
/* The file                                                            */
/* ------------------------------------------------------------------ */

/**
 * Rows of a Meta or TikTok export, ready to preview and import. Lines that
 * describe the same campaign, ad set, ad and days (an export broken down by
 * age or placement) are added up into one row.
 */
export function readPlatformExport(input: string, opts: ExportOptions = {}): PlatformExport {
  const out: PlatformExport = { platform: null, source: null, currency: null, rows: [], skipped: [], warnings: [], columns: {}, total: { amount: 0, from: null, to: null } };
  const fail = (error: string, needs?: PlatformExport["needs"]) => ({ ...out, rows: [], total: { amount: 0, from: null, to: null }, error, ...(needs ? { needs } : {}) });

  const table = parseDelimited(input, detectDelimiter(input.replace(/^\uFEFF/, "")));
  // A title line may sit above the columns: the header is the first line with a spend column.
  const headerAt = table.slice(0, 10).findIndex((r) => r.some((h) => headerField(text(h))?.field === "amount"));
  if (headerAt < 0) return fail("Aucune colonne de dépense trouvée (« Montant dépensé », « Amount spent » ou « Cost »). Exportez le rapport depuis le gestionnaire de publicités, sans le modifier.");
  const header = table[headerAt];
  const data = table.slice(headerAt + 1);
  if (data.length === 0) return fail("Le fichier ne contient aucune ligne de résultats.");
  if (data.length > MAX_EXPORT_ROWS) return fail(`Trop de lignes (${data.length}) : ${MAX_EXPORT_ROWS} au plus par import. Exportez un mois à la fois.`);

  const at: Partial<Record<Field, number>> = {};
  let fr = 0;
  let en = 0;
  let meta = 0;
  let tiktok = 0;
  let headerCurrency: string | null = null;
  header.forEach((h, i) => {
    const hit = headerField(text(h));
    const k = normHeader(text(h).replace(/\s*[([][^()[\]]*[)\]]\s*$/, ""));
    if (META_ONLY.has(k)) meta++;
    if (TIKTOK_ONLY.has(k)) tiktok++;
    if (!hit || at[hit.field] != null) return;
    at[hit.field] = i;
    out.columns[hit.field] = text(h);
    if (hit.lang === "fr") fr++;
    if (hit.lang === "en") en++;
    if (hit.field === "amount") headerCurrency = hit.currency;
  });
  const french = fr > en;
  const cell = (row: string[], f: Field) => (at[f] == null ? undefined : row[at[f]!]);

  out.platform = meta > tiktok ? "meta" : tiktok > meta ? "tiktok" : null;
  // A Meta export forced to "instagram" is still the Meta account's spend: saved under "facebook", where Instagram's ad visits are counted.
  const source = opts.source ? spendSource(opts.source) : out.platform ? SOURCE_OF[out.platform] : null;
  if (!source) return fail("Plateforme non reconnue : choisissez la source (facebook, tiktok…).", "source");
  if (!/^[a-z0-9._-]{2,40}$/.test(source)) return fail("Source invalide : des lettres minuscules, par exemple facebook ou tiktok.", "source");
  out.source = source;

  // Currency: the spend column's "(TND)", else a currency column, else what the owner said.
  const columnCurrencies = new Set(at.currency == null ? [] : data.map((r) => currencyCode(cell(r, "currency") ?? "")).filter((c): c is string => c != null));
  if (columnCurrencies.size > 1) return fail(`Plusieurs devises dans le même fichier (${[...columnCurrencies].join(", ")}) : exportez un compte à la fois.`);
  const columnCurrency = [...columnCurrencies][0] ?? null;
  if (headerCurrency && columnCurrency && headerCurrency !== columnCurrency) return fail(`Devise contradictoire : ${headerCurrency} dans le nom de la colonne, ${columnCurrency} dans la colonne « Devise ».`);
  const currency = headerCurrency ?? columnCurrency ?? (opts.currency ? currencyCode(opts.currency) : null);
  if (!currency) return fail("Le fichier ne dit pas en quelle devise sont les dépenses : choisissez la devise du compte publicitaire.", "currency");
  out.currency = currency;
  let rate = 1;
  if (currency !== "TND") {
    if (!opts.rate || !Number.isFinite(opts.rate) || opts.rate <= 0 || opts.rate > 100) {
      return fail(`Dépenses en ${currency} : indiquez combien de dinars vous payez pour 1 ${currency} (taux de la banque, frais compris).`, "rate");
    }
    rate = opts.rate;
    out.warnings.push(`Montants convertis de ${currency} en dinars au taux indiqué : 1 ${currency} = ${String(opts.rate).replace(".", ",")} DT.`);
  }

  if (at.day == null && at.starts == null) return fail("Aucune colonne de date (« Jour », « Day », « Date » ou « Début des rapports »). Exportez le rapport avec une date.");

  const style = numberStyle(
    data.flatMap((r) => (["amount", "impressions", "clicks", "reach", "purchases", "results"] as Field[]).map((f) => cell(r, f) ?? "")),
    french,
  );
  // Day and month: a first number above 12 shows the day comes first; a second above 12, the month.
  const dateCells = data.flatMap((r) => [cell(r, "day"), cell(r, "starts"), cell(r, "ends")]).map((c) => text(c).match(LOCAL_DAY)).filter((m): m is RegExpMatchArray => m != null);
  const monthFirst = !dateCells.some((m) => Number(m[1]) > 12) && dateCells.some((m) => Number(m[2]) > 12);
  if (dateCells.length > 0 && !dateCells.some((m) => Number(m[1]) > 12 || Number(m[2]) > 12)) out.warnings.push("Dates lues jour/mois/année : vérifiez les jours dans l'aperçu.");

  const purchasesFromResults = at.purchases == null && at.results != null;
  if (at.purchases == null && at.results != null && at.resultIndicator == null) {
    out.warnings.push("La colonne « Résultats » est ignorée : sans « Indicateur de résultat », rien ne dit que ce sont des achats.");
  }
  const hasNames = at.campaign != null || at.adSet != null || at.ad != null;

  const merged = new Map<string, ExportRow>();
  data.forEach((r, i) => {
    const line = headerAt + i + 2;
    const skip = (reason: string) => out.skipped.push({ line, reason });
    const campaign = readName(cell(r, "campaign"));
    const adSet = readName(cell(r, "adSet"));
    const ad = readName(cell(r, "ad"));
    // The ID stays the same when the account is renamed.
    const account = readName(cell(r, "accountId")) ?? readName(cell(r, "accountName"));
    const first = text(r[0]);
    if ([campaign, adSet, ad, first].some((v) => v != null && TOTAL.test(v))) return skip("Ligne de total");
    if (hasNames && campaign == null && adSet == null && ad == null) return skip("Ligne de total (sans nom de campagne)");

    let day: string | null | undefined;
    let days = 1;
    if (at.day != null) {
      day = readDay(cell(r, "day"), monthFirst);
    }
    if (day == null && at.starts != null) {
      day = readDay(cell(r, "starts"), monthFirst);
      const end = at.ends == null ? day : readDay(cell(r, "ends"), monthFirst);
      if (day && end === undefined) return skip(`Date de fin illisible : « ${text(cell(r, "ends"))} »`);
      if (day && end) {
        days = daysBetween(day, end) + 1;
        if (days < 1) return skip("La date de fin est avant la date de début");
      }
    }
    if (day === undefined) return skip(`Date illisible : « ${text(cell(r, "day") ?? cell(r, "starts"))} »`);
    if (day == null) return skip("Pas de date (ligne de total ?)");
    if (days > MAX_ROW_DAYS) return skip(`Plus de ${MAX_ROW_DAYS} jours sur une ligne : exportez par jour ou par semaine`);

    const spent = readNumber(cell(r, "amount"), style, false);
    if (spent === undefined) return skip(`Montant illisible : « ${text(cell(r, "amount"))} »`);
    if (spent != null && spent < 0) return skip("Montant négatif");
    const amount = Math.round((spent ?? 0) * rate * 1000);
    if (amount === 0) return skip("Aucune dépense");

    const counts: Partial<Record<"impressions" | "clicks" | "reach" | "purchases", number | null>> = {};
    for (const f of ["impressions", "clicks", "reach", "purchases"] as const) {
      const from: Field = f === "purchases" && purchasesFromResults ? "results" : f;
      if (at[from] == null) {
        counts[f] = null;
        continue;
      }
      if (from === "results") {
        // Results are purchases only where the row says so (a messages or traffic campaign has other results).
        const indicator = text(cell(r, "resultIndicator"));
        if (at.resultIndicator == null || !PURCHASE_RESULT.test(indicator)) {
          counts[f] = null;
          continue;
        }
      }
      const raw = cell(r, from);
      const v = readNumber(raw, style, true);
      if (v === undefined || (v != null && v < 0)) return skip(`Nombre illisible (${out.columns[from]}) : « ${text(raw)} »`);
      // An empty cell where the column exists is the platform's zero (Meta leaves zeros blank); a dash is "not given".
      counts[f] = v ?? (text(raw) === "" ? 0 : null);
    }

    const key = [source, normName(account), normName(campaign), normName(adSet), normName(ad), day, days].join("\u0000");
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { day, days, source, campaign, adSet, ad, account, amount, impressions: counts.impressions ?? null, clicks: counts.clicks ?? null, reach: counts.reach ?? null, purchases: counts.purchases ?? null, line, lines: 1 });
      return;
    }
    const add = (a: number | null, b: number | null | undefined) => (a == null ? (b ?? null) : b == null ? a : a + b);
    prev.amount += amount;
    prev.impressions = add(prev.impressions, counts.impressions);
    prev.clicks = add(prev.clicks, counts.clicks);
    prev.reach = add(prev.reach, counts.reach);
    prev.purchases = add(prev.purchases, counts.purchases);
    prev.lines++;
  });

  out.rows = [...merged.values()];
  const added = out.rows.filter((r) => r.lines > 1);
  if (added.length > 0) {
    out.warnings.push(
      `${added.reduce((s, r) => s + r.lines, 0)} lignes additionnées en ${added.length} : l'export est ventilé (âge, placement…). La couverture additionnée peut compter deux fois les mêmes personnes.`,
    );
  }
  if (out.rows.length === 0 && !out.error) return { ...out, error: "Aucune ligne avec une dépense dans ce fichier." };
  for (const r of out.rows) {
    out.total.amount += r.amount;
    const end = addDays(r.day, r.days - 1);
    if (!out.total.from || r.day < out.total.from) out.total.from = r.day;
    if (!out.total.to || end > out.total.to) out.total.to = end;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Saving                                                              */
/* ------------------------------------------------------------------ */

/**
 * What makes two imported rows the same spend: source, campaign, ad set, ad
 * and days, case aside, plus the ad account when the export names it (two
 * accounts may run campaigns with the same names). A row without an account
 * keeps the key it always had, so importing an older file again still
 * replaces its rows. The server hashes this text into AdSpend.importKey.
 */
export function importKeyText(r: Pick<SpendRow, "source" | "campaign" | "adSet" | "ad" | "account" | "day" | "days">): string {
  const parts: (string | number | null)[] = [r.source, normName(r.campaign), normName(r.adSet), normName(r.ad), r.day, r.days];
  const account = normName(r.account);
  return JSON.stringify(account == null ? parts : [...parts, account]);
}

/**
 * A spend row already saved, as the import compares it: `imported` when it
 * came from an export (it has an import key); `account`, the ad account its
 * key names (null: typed by hand, or an export without the account column).
 */
export type SavedSpend = { id: string; day: string; days: number; source: string; campaign: string | null; adSet: string | null; ad: string | null; account?: string | null; imported: boolean; amount?: number };

/**
 * Under this share of the spend it replaces, a file probably leaves some ads
 * out (an export filtered to one ad, after the campaign's total): the preview
 * says so with both amounts. Meta's later revisions of a day move it by a few
 * percent, far less.
 */
export const SHRINK_WARN = 0.9;

export type ImportPlan = {
  /**
   * Earlier imported rows the new file supersedes: same source and campaign,
   * every one of their days in the file for that campaign, and a row of the
   * file on those days for the same spend (see `overlaps`).
   */
  replaced: string[];
  /**
   * Rows kept that share days with a new row of the same spend (same source,
   * and the same campaign, ad set, ad and ad account, or one of them left
   * blank): earlier imports only partly covered, or spend typed by hand,
   * which an import never deletes. Those days may be counted twice.
   */
  overlaps: { imported: number; typed: number };
  /**
   * Campaigns whose spend on the days of the replaced rows would fall under
   * SHRINK_WARN of what those rows held (millimes, before → after). Only
   * when every amount is given.
   */
  shrinks: { campaign: string | null; before: number; after: number }[];
};

type Span = { start: number; end: number };
const span = (r: { day: string; days: number }): Span => {
  const start = Date.parse(`${r.day}T00:00:00Z`) / DAY_MS;
  return { start, end: start + Math.max(1, r.days) };
};

/**
 * What saving `rows` does to the spend already saved. A newer export of a
 * campaign is the platform's latest word on the days it covers, whatever its
 * grain: the same days exported by ad after a campaign total, or as one
 * weekly total after seven daily rows, replace the earlier import instead of
 * adding to it. An earlier row with only some of its days in the new file is
 * kept (deleting it would lose the other days) and reported. So is an ad, or
 * an ad set, the file does not name while it names others of the campaign:
 * an export filtered to one ad says nothing about the other ones. Another ad
 * account's spend is never the same spend, even under the same campaign
 * name; a row whose account is not known may be any account's. Sources are
 * compared as spendSource reads them: spend saved under "instagram" is the
 * Meta account's, as the ads page counts it. The file cannot say whether it
 * was filtered: when the rows it replaces held clearly more spend than it
 * brings on their days, `shrinks` says so before anything is saved.
 */
export function planImport(rows: (Pick<SpendRow, "day" | "days" | "source" | "campaign" | "adSet" | "ad"> & { account?: string | null; amount?: number })[], saved: SavedSpend[]): ImportPlan {
  const group = (source: string, campaign: string | null) => `${spendSource(source)}\u0000${normName(campaign) ?? ""}`;
  const same = (a: string | null, b: string | null) => a == null || b == null || a === b;
  const spans = new Map<string, (Span & { adSet: string | null; ad: string | null; account: string | null })[]>();
  for (const r of rows) {
    const g = group(r.source, r.campaign);
    spans.set(g, [...(spans.get(g) ?? []), { ...span(r), adSet: normName(r.adSet), ad: normName(r.ad), account: normName(r.account) }]);
  }
  // The days a campaign of the file covers for one account, as merged runs of days.
  const covered = new Map<string, Span[]>();
  const coveredFor = (g: string, account: string | null) => {
    const k = `${g}\u0000${account ?? ""}`;
    let runs = covered.get(k);
    if (!runs) {
      runs = [];
      for (const s of (spans.get(g) ?? []).filter((n) => same(account, n.account)).sort((a, b) => a.start - b.start)) {
        const last = runs[runs.length - 1];
        if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
        else runs.push({ start: s.start, end: s.end });
      }
      covered.set(k, runs);
    }
    return runs;
  };
  const bySource = new Map<string, string[]>();
  for (const g of spans.keys()) {
    const source = g.split("\u0000")[0];
    bySource.set(source, [...(bySource.get(source) ?? []), g]);
  }

  const plan: ImportPlan = { replaced: [], overlaps: { imported: 0, typed: 0 }, shrinks: [] };
  const gone = new Map<string, SavedSpend[]>();
  for (const s of saved) {
    const d = span(s);
    const g = group(s.source, s.campaign);
    const adSet = normName(s.adSet);
    const ad = normName(s.ad);
    const account = normName(s.account);
    // A new row on some of the same days for the same spend: the same ad set, ad and account, or a total that includes it, or a part of it.
    const meetsIn = (k: string) => spans.get(k)?.some((n) => n.start < d.end && d.start < n.end && same(adSet, n.adSet) && same(ad, n.ad) && same(account, n.account)) ?? false;
    if (s.imported && coveredFor(g, account).some((run) => run.start <= d.start && d.end <= run.end) && meetsIn(g)) {
      plan.replaced.push(s.id);
      gone.set(g, [...(gone.get(g) ?? []), s]);
      continue;
    }
    // A row without a campaign meets every campaign of its source; a campaign meets itself and the rows without one.
    const campaign = normName(s.campaign);
    const groups = campaign == null ? (bySource.get(spendSource(s.source)) ?? []) : [g, group(s.source, null)];
    if (groups.some(meetsIn)) plan.overlaps[s.imported ? "imported" : "typed"]++;
  }

  // Per campaign, what the replaced rows held against what the file gives on their days.
  const known = rows.every((r) => r.amount != null) && saved.every((s) => s.amount != null);
  for (const [g, list] of known ? gone : []) {
    const runs: Span[] = [];
    for (const x of list.map(span).sort((a, b) => a.start - b.start)) {
      const last = runs[runs.length - 1];
      if (last && x.start <= last.end) last.end = Math.max(last.end, x.end);
      else runs.push({ ...x });
    }
    const dayOf = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
    const before = list.reduce((t, s) => t + s.amount!, 0);
    const after = rows
      .filter((r) => group(r.source, r.campaign) === g)
      .reduce((t, r) => t + runs.reduce((u, run) => u + spendInRange({ day: r.day, days: r.days, amount: r.amount! }, dayOf(run.start), dayOf(run.end)), 0), 0);
    if (after < before * SHRINK_WARN) plan.shrinks.push({ campaign: list[0].campaign, before, after });
  }
  return plan;
}

/**
 * A row's whole number (millimes, impressions, clicks) shared out over its
 * days inside [fromDay, toDay): each day gets what the row's share of the
 * period (spendInRange) grows by that day, so the days add up exactly to what
 * the period counts for the row, also when the row starts before the period
 * (rounding each day would drift: 12 345 over 7 days gave 12 348). Every day
 * gets the total divided by the days, rounded down or up.
 */
export function dayShares(total: number, row: { day: string; days: number }, fromDay: string, toDay: string): { day: string; value: number }[] {
  const r = { day: row.day, days: Math.max(1, row.days), amount: total };
  const first = row.day > fromDay ? row.day : fromDay;
  const end = addDays(row.day, r.days);
  const last = end < toDay ? end : toDay;
  const out: { day: string; value: number }[] = [];
  for (let d = first; d < last; d = addDays(d, 1)) out.push({ day: d, value: spendInRange(r, first, addDays(d, 1)) - spendInRange(r, first, d) });
  return out;
}
