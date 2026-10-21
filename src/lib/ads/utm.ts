import { href, type Lang } from "../../i18n/lang";
import { META_SOURCE, normName, normSource, spendSource } from "./match";

/**
 * The link an ad sends people to: the product page with the utm_* the site
 * reads (src/lib/client/attribution.ts), so each visit and order is credited
 * to its campaign and ad, and the spend imported from the same platform
 * finds them (./match compares names trimmed and lowercased, nothing more).
 *
 * Meta's link says utm_source=facebook wherever the ad runs (Instagram,
 * Messenger): that is where its export's spend is saved. A link written with
 * Meta's {{site_source_name}} (fb, ig, msg) also meets it: ./match counts the
 * ad traffic of every Meta app for facebook (adSource).
 *
 * The safest names are the platform's own: with its macros, Meta and TikTok
 * write the campaign and ad names into the link at each click, so they are
 * exactly the names of the export. A name typed by hand only matches if the
 * campaign carries the same name in Ads Manager; the checks say so. Pure.
 *
 *   buildAdLink(input)             → AdLink     the address, the parameters alone, and the checks
 *   cleanName(s)                   → string     "Lampe Oct" → "lampe-oct"
 *   shortSlug(slug)                → string     the first words of a slug, for names
 *   suggestAdName(slug, angle, v)  → string     "lampe-chevet-demo-v1"
 *   suggestCampaign(slug, day)     → string     "lampe-chevet-2026-10"
 */

/** Where the ad runs: Meta (Facebook, Instagram), TikTok, or anything else (Snapchat, an influencer…). */
export type AdPlatform = "meta" | "tiktok" | "other";

/** Placeholders the platform replaces with the real names on each click. TikTok: AID is the ad group, CID the ad. */
export const MACROS = {
  meta: { campaign: "{{campaign.name}}", adSet: "{{adset.name}}", ad: "{{ad.name}}" },
  tiktok: { campaign: "__CAMPAIGN_NAME__", adSet: "__AID_NAME__", ad: "__CID_NAME__" },
} as const;

/** The source each platform's export is imported under (platform-csv): the link must say the same, or spend and visits never meet. */
export const PLATFORM_SOURCE = { meta: META_SOURCE, tiktok: "tiktok" } as const;

/** One of the mediums data.ts counts as a paid click. */
export const PAID_MEDIUM = "paid";

/** The site keeps the first 120 characters of utm_campaign and utm_content: a longer name is cut and no longer matches its spend. */
export const MAX_NAME = 120;

/** A source as the import accepts it (importAdSpend): lowercase letters, digits, dots, dashes, underscores. */
const SOURCE_RE = /^[a-z0-9._-]{2,40}$/;

/** Any platform's macro, to catch one pasted into the wrong platform's link. */
const ANY_MACRO = /\{\{[^}]*\}\}|__[A-Z_]+__/;

export type LinkInput = {
  /** The shop's address (SITE_URL). */
  site: string;
  slug: string;
  lang: Lang;
  platform: AdPlatform;
  /** "other" only: the source word (snapchat, influenceur…). Meta and TikTok use PLATFORM_SOURCE. */
  source?: string;
  /** Names typed by hand. Empty: the platform's macro (Meta, TikTok), or nothing (other). */
  campaign?: string;
  adSet?: string;
  ad?: string;
  /** Campaign and ad names already seen on visits and spend (data.ts knownKeys), to catch near-duplicates. */
  known?: { campaigns: string[]; ads: string[] };
};

export type LinkField = "product" | "source" | "campaign" | "adSet" | "ad";
export type LinkCheck = { field: LinkField; level: "error" | "warning" | "info"; message: string };

export type AdLink = {
  /** The whole address, for the "Site web" field (Meta) or "URL de destination" (TikTok). Empty when an error blocks it. */
  url: string;
  /** The query string alone, for Meta's "Paramètres d'URL" field. Empty when an error blocks it. */
  params: string;
  /** The values written in the link: cleaned names, or macros. */
  values: { source: string; medium: string; campaign: string | null; adSet: string | null; ad: string | null };
  /** Parts the platform fills in at each click. */
  macros: LinkField[];
  checks: LinkCheck[];
  ok: boolean;
};

/** "Lampe  Oct " → "lampe-oct": lowercase, spaces become dashes. Accents and Arabic letters are kept: they pass in a link and match. */
export function cleanName(s: string): string {
  return s
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Letters and digits only, without accents: two names equal here but not under normName are near-duplicates. */
const loose = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

/** The first two words of a slug, short enough to leave room in a name: "diffuseur-huiles-essentielles" → "diffuseur-huiles". */
export function shortSlug(slug: string): string {
  return slug.split("-").filter(Boolean).slice(0, 2).join("-").slice(0, 30) || "produit";
}

/** An ad named after what it tests, so the Créatives tab reads like a test plan: "lampe-chevet-demo-v1". */
export function suggestAdName(slug: string, angle: string, version = 1): string {
  return cleanName(`${shortSlug(slug)}-${angle}-v${version}`);
}

/** A campaign per product and month: "lampe-chevet-2026-10". `day` is a Tunisian day, YYYY-MM-DD. */
export function suggestCampaign(slug: string, day: string): string {
  return cleanName(`${shortSlug(slug)}-${day.slice(0, 7)}`);
}

type NameField = "campaign" | "adSet" | "ad";
const FIELD_LABEL: Record<NameField, string> = { campaign: "campagne", adSet: "ensemble de publicités", ad: "publicité" };
const PLATFORM_LABEL = { meta: "Meta", tiktok: "TikTok" } as const;

/**
 * Checks one typed name. The shop matches campaigns and ads (not ad sets) on
 * their names, so a change made by the cleaning, a cut, or a near-duplicate
 * of a name already in use is said plainly.
 */
function checkTyped(field: NameField, raw: string, clean: string, platform: AdPlatform, known: string[]): LinkCheck[] {
  const out: LinkCheck[] = [];
  const label = FIELD_LABEL[field];
  const matched = field !== "adSet";
  const macro = raw.match(ANY_MACRO)?.[0];
  if (macro) {
    const own = platform !== "other" && (Object.values(MACROS[platform]) as string[]).includes(macro);
    if (!own) out.push({ field, level: "error", message: `« ${macro} » n'est pas un code de ${platform === "other" ? "cette source" : PLATFORM_LABEL[platform]} : il resterait tel quel dans le lien. Laissez le champ vide pour utiliser le bon.` });
    return out;
  }
  if (clean.length > MAX_NAME) out.push({ field, level: "error", message: `Nom de ${label} trop long (${clean.length} caractères, ${MAX_NAME} au plus) : le site le couperait et il ne correspondrait plus.` });
  if (matched && normName(raw) !== clean)
    out.push({ field, level: "warning", message: `« ${raw.trim()} » devient « ${clean} » : donnez exactement ce nom à la ${label} dans ${platform === "tiktok" ? "TikTok Ads" : "Ads Manager"}, sinon ses dépenses ne seront pas reliées à ses visites.` });
  if (matched && clean) {
    const same = known.find((k) => normName(k) === clean);
    const key = loose(clean);
    const near = same || !key ? null : known.find((k) => loose(k) === key);
    if (same) out.push({ field, level: "info", message: `Nom déjà utilisé : les visites s'ajouteront à celles de « ${same} ».` });
    else if (near) out.push({ field, level: "warning", message: `Très proche de « ${near} », déjà utilisé, sans être identique : ce seront deux ${label}s séparées. Reprenez « ${near} » si c'est la même.` });
  }
  return out;
}

/** The link for one ad, with what may break the matching of its visits, orders and spend. */
export function buildAdLink(input: LinkInput): AdLink {
  const checks: LinkCheck[] = [];
  const macros: LinkField[] = [];
  const known = input.known ?? { campaigns: [], ads: [] };

  let source: string;
  if (input.platform === "other") {
    source = normSource(input.source);
    if (!input.source?.trim()) checks.push({ field: "source", level: "error", message: "Indiquez la source : snapchat, influenceur…" });
    else if (!SOURCE_RE.test(source)) checks.push({ field: "source", level: "error", message: "Source invalide : des lettres minuscules sans espace, par exemple snapchat ou influenceur." });
    // An Instagram or Messenger ad is a Meta ad: its visits count for facebook, with the Meta export's spend.
    else if (spendSource(source) === PLATFORM_SOURCE.meta || source === PLATFORM_SOURCE.tiktok)
      checks.push({ field: "source", level: "warning", message: `Pour ${source}, choisissez la plateforme ${source === PLATFORM_SOURCE.tiktok ? "TikTok" : "Meta"} : ses codes remplissent les noms tout seuls.` });
  } else {
    source = PLATFORM_SOURCE[input.platform];
  }

  const part = (field: NameField, raw: string | undefined, knownNames: string[]): string | null => {
    const typed = raw?.trim() ?? "";
    if (!typed) {
      if (input.platform === "other") return null;
      macros.push(field);
      return MACROS[input.platform][field];
    }
    if (ANY_MACRO.test(typed)) {
      checks.push(...checkTyped(field, typed, typed, input.platform, knownNames));
      if (input.platform !== "other") macros.push(field);
      return typed;
    }
    const clean = cleanName(typed);
    checks.push(...checkTyped(field, typed, clean, input.platform, knownNames));
    return clean || null;
  };
  const campaign = part("campaign", input.campaign, known.campaigns);
  const adSet = part("adSet", input.adSet, []);
  const ad = part("ad", input.ad, known.ads);

  if (input.platform === "other") {
    if (!campaign) checks.push({ field: "campaign", level: "warning", message: "Sans nom de campagne, les visites ne seront comptées que pour la source." });
    if (!ad) checks.push({ field: "ad", level: "info", message: "Sans nom de publicité, l'onglet Créatives ne pourra pas comparer les publicités de cette source." });
  } else if (macros.length) {
    const p = PLATFORM_LABEL[input.platform];
    checks.push({ field: macros[0], level: "info", message: `${p} écrit les vrais noms dans le lien à chaque clic : visites et dépenses importées se retrouvent toutes seules. Gardez des noms courts, et ne renommez pas une publicité qui tourne : l'avant et l'après seraient comptés à part.` });
  }

  if (!/^[a-z0-9-]{1,200}$/.test(input.slug)) checks.push({ field: "product", level: "error", message: "Produit sans adresse valide." });

  const ok = !checks.some((c) => c.level === "error");
  const pairs: [string, string | null][] = [
    ["utm_source", source],
    ["utm_medium", PAID_MEDIUM],
    ["utm_campaign", campaign],
    // The ad set is not matched by the shop; it travels as utm_term for Google Analytics and later reading.
    ["utm_term", adSet],
    ["utm_content", ad],
  ];
  // Macros stay as typed: an encoded {{campaign.name}} would not be replaced.
  const encode = (v: string) => (ANY_MACRO.test(v) ? v : encodeURIComponent(v));
  const params = pairs
    .filter((p): p is [string, string] => p[1] != null && p[1] !== "")
    .map(([k, v]) => `${k}=${encode(v)}`)
    .join("&");
  const base = `${input.site.replace(/\/+$/, "")}${href(input.lang, `/produit/${input.slug}`)}`;

  return {
    url: ok ? `${base}?${params}` : "",
    params: ok ? params : "",
    values: { source, medium: PAID_MEDIUM, campaign, adSet, ad },
    macros,
    checks,
    ok,
  };
}
