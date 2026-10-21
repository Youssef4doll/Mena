import { formatTND } from "../money";
import { fmt } from "../viz";
import { deliveryRangeLabel } from "../delivery";
import { TZ } from "../analytics-range";
import { JUDGE_MIN_ORDERS, JUDGE_SPEND_MULTIPLE } from "./advisor";
import { productBreakEvens, type BreakEvenInput } from "./breakeven";
import { CONFIRM_PRIOR_ORDERS, DELIVERY_PRIOR_PARCELS, plural } from "./kpis";
import { shrink, wilson } from "./stats";
import { suggestAdName } from "./utm";

/**
 * The creative brief for one product: which angles to film, the first three
 * seconds, ready-to-use texts in Tunisian derja (Arabic letters) and French,
 * the formats, the shot list, the call to action, the rules, and a test
 * plan. Built from the product's own facts and the shop's real promises
 * (delivery fee and delay, cash on delivery, open before paying), never from
 * a claim the shop did not make: no invented feature, number, review,
 * discount or urgency. What the data says about the product (confirmation,
 * refusals, the page, packs, the best ad) decides which angles come first.
 * Pure and deterministic; the server loads the input (brief-data.ts).
 *
 *   buildBrief(input)            → Brief
 *   copyWarnings(text, input)    → string[]   what in an ad text breaks the rules (price not on the site, fake urgency…)
 */

// ── Thresholds ─────────────────────────────────────────────────────────

/** Orders whose confirmation is decided before the product's rate is read: under 20, one bad afternoon of calls decides. */
export const READ_MIN_DECIDED = 20;
/** Parcels delivered or back before the product's delivery rate is read. */
export const READ_MIN_PARCELS = 15;
/** Product-page visits before its visit → form rate is read. */
export const READ_MIN_VISITS = 100;
/** Share of orders with 2 units or more from which a pack is worth putting in the ad, and the orders needed to say it. */
export const PACK_SHARE = 0.25;
export const PACK_MIN_ORDERS = 10;
/** An ad becomes the control to beat with this many visits of the product page and orders. */
export const CONTROL_MIN_VISITS = 100;
export const CONTROL_MIN_ORDERS = 3;
/** A primary text's first line is cut here: Meta shows about 125 characters before "Voir plus". */
const LINE_MAX = 125;
/** TikTok's ad text holds 100 characters. */
const CAPTION_MAX = 100;
/** A quote longer than this is shortened (with "…") for the on-screen text. */
const QUOTE_SCREEN_MAX = 90;

// ── Input ──────────────────────────────────────────────────────────────

export type BriefOffer = {
  id: string;
  label: string;
  labelAr: string | null;
  quantity: number;
  /** Millimes, for the `quantity` units. */
  price: number;
  freeDelivery: boolean;
  /** A real end date (ISO), shown to customers; null: none. */
  endsAt: string | null;
};

export type BriefProduct = {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  summary: string;
  summaryAr: string | null;
  /** "Matière : inox", one per line; the Arabic lines are in the same order. */
  specs: string;
  specsAr: string | null;
  category: string | null;
  categoryAr: string | null;
  price: number;
  /** A real previous price; only used when higher than the price. */
  compareAt: number | null;
  /** Supplier cost of one unit, for the ceilings; never written in a text. */
  cost: number | null;
  hasVideo: boolean;
  photos: number;
  /** Choices still available (colour, size). */
  variants: { name: string; nameAr: string | null }[];
  /** Active offers not ended. */
  offers: BriefOffer[];
  active: boolean;
  available: boolean;
};

export type BriefShop = {
  deliveryFee: number;
  /** Goods total from which delivery is free; null: never. */
  freeThreshold: number | null;
  /** Shortest and longest delay over the governorates served (working days); null: none served. */
  delivery: { minDays: number; maxDays: number } | null;
  /** Every governorate is served. */
  everywhere: boolean;
  openBeforePaying: boolean;
  returnDays: number;
  carrierPerParcel: number | null;
  returnPerParcel: number | null;
};

/** An approved review, as published on the site. */
export type BriefReview = { rating: number; text: string | null; authorName: string; governorate: string | null };

/** What one ad (utm_content, else campaign) brought to this product's page. */
export type BriefAdStat = { source: string; campaign: string | null; ad: string | null; visits: number; orders: number; confirmed: number; delivered: number; back: number };

export type Reason = { reason: string; count: number };

/** The product's real numbers over `days` (orders typed in the back office left out). */
export type BriefPerformance = {
  days: number;
  /** Visits that opened the product page, and those that started its order form. */
  visits: number;
  formStarts: number;
  /** The same over every product page of the shop: the reference for this page. */
  shopVisits: number;
  shopFormStarts: number;
  /** Orders containing the product. `decided`: confirmed or cancelled; `back`: refused or returned; `open`: not final. */
  orders: number;
  confirmed: number;
  decided: number;
  delivered: number;
  back: number;
  open: number;
  /** Orders that took 2 units or more of it. */
  multiUnitOrders: number;
  /** Refusal reasons typed for this product's parcels, and for the whole shop. */
  refusals: Reason[];
  shopRefusals: Reason[];
  ads: BriefAdStat[];
  /** What customers typed in the search before opening this product. */
  searches: { q: string; count: number }[];
};

export type BriefInput = {
  product: BriefProduct;
  shop: BriefShop;
  /** Approved reviews: their number, average, and a few with text (best first). */
  reviews: { count: number; average: number | null; quotes: BriefReview[] };
  performance: BriefPerformance;
  /** The shop's own rates (data.ts baseline). */
  baseline: { confirmRate: number | null; deliveryRate: number | null };
  /** When the input was read (ISO): offers ending before are ignored. */
  asOf: string;
};

// ── Output ─────────────────────────────────────────────────────────────

export type Lines = { fr: string; ar: string };
export type AngleKey = "demo" | "problem" | "beforeAfter" | "testimonial" | "offer" | "unboxing" | "gift";
export type FormatKey = "video" | "carousel" | "static";

/** The first three seconds: what is seen, and the text on screen. */
export type Hook = { angle: AngleKey | null; visual: string; text: Lines };

export type Angle = {
  key: AngleKey;
  title: string;
  /** Why this angle can work, with the product's numbers when there are some. */
  why: string;
  /** Why it comes first for this product (a focus of the data), or null. */
  boost: string | null;
  /** What to film or photograph. */
  show: string;
  hook: Hook;
  /** Meta's primary text, line by line. */
  primary: Lines;
  headline: Lines;
  /** TikTok's ad text (100 characters at most). */
  caption: Lines;
  format: FormatKey;
  /** Name for the ad in Ads Manager, and its utm_content with the link builder. */
  adName: string;
  /** A rule that matters for this angle in particular. */
  caution: string | null;
};

export type Format = { key: FormatKey; label: string; where: string; structure: string[]; tips: string[] };

/** What the product's numbers say the creative must fix, with the numbers. */
export type Focus = { key: "confirmation" | "delivery" | "page" | "pack" | "control" | "new"; title: string; evidence: string; action: string };

/** A fact the texts may use: everything an ad may say comes from this list. */
export type Fact = { label: string; fr: string; ar: string | null };

export type CeilingRow = { key: string; label: string; units: number; margin: number | null; maxCostPerDelivered: number | null; maxCpa: number | null };
export type Ceilings = {
  rows: CeilingRow[];
  /** Rates the ceilings use: the product's, pulled toward the shop's (an estimate). */
  confirmRate: number | null;
  deliveryRate: number | null;
  /** What is missing for the ceilings, in French. */
  missing: string[];
};

export type Brief = {
  focus: Focus[];
  /** Best first for this product. */
  angles: Angle[];
  /** Every hook of the angles, then hooks from the product's own facts (sizes, choices, what customers search). */
  hooks: Hook[];
  formats: Format[];
  /** What the product page already has to build ads from. */
  assets: string[];
  shots: string[];
  cta: { button: string; text: Lines };
  facts: Fact[];
  compliance: string[];
  tests: string[];
  ceilings: Ceilings;
  /** What would make the brief better, in French. */
  missing: string[];
  days: number;
};

// ── Helpers ────────────────────────────────────────────────────────────

const pct = (v: number | null) => fmt(v, "pct");
const tnd = (m: number, ar = false) => formatTND(m, ar ? "ar" : "fr");
const one = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/** The text up to its first full stop, at most `max` characters, cut at a word (with "…") when longer. */
export function firstSentence(text: string, max = LINE_MAX): string {
  const t = text.replace(/\s+/g, " ").replace(/!/g, ".").trim();
  const end = t.search(/[.؟?](\s|$)/);
  const s = end >= 0 ? t.slice(0, end + 1) : t;
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:،]+$/, "")}…`;
}

/** "Matière : inox" lines as label and value; lines without a colon are skipped. */
export function specLines(specs: string | null): { label: string; value: string }[] {
  return (specs ?? "")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([^:]{1,60}?)\s*:\s*(.+?)\s*$/))
    .filter((m): m is RegExpMatchArray => m != null)
    .map((m) => ({ label: m[1], value: m[2] }));
}

/** Spec labels that tell the size: the facts that keep a customer from being surprised at the door. */
const SIZE_RE = /dimension|taille|longueur|largeur|hauteur|diam|capacit|contenance|volume|poids|format|مقاس|طول|عرض|حجم|وزن|قياس/i;

const quantityAr = (q: number) => (q === 2 ? "زوز حبّات" : `${q} حبّات`);
const tunisDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
const capped = (s: string, max: number) => (s.length <= max ? s : firstSentence(s, max));

/**
 * The pack to put in the ads: the one that leaves the most per delivered
 * order when the costs are known (it can pay the most for its ads), else the
 * lowest price per unit. Packs of 2 units or more only.
 */
function heroOffer(offers: BriefOffer[], c: Ceilings | null = null): BriefOffer | null {
  const packs = offers.filter((o) => o.quantity >= 2);
  if (!packs.length) return null;
  const margin = (o: BriefOffer) => c?.rows.find((r) => r.key === o.id)?.margin ?? null;
  const perUnit = (o: BriefOffer) => o.price / o.quantity;
  const known = packs.every((o) => margin(o) != null);
  return packs.reduce((best, o) => {
    if (known && margin(o)! !== margin(best)!) return margin(o)! > margin(best)! ? o : best;
    return perUnit(o) < perUnit(best) ? o : best;
  });
}

/** The review to quote: one without exclamation marks first (it is quoted word for word), then the best rating, then the shortest text that still says something. */
function bestQuote(quotes: BriefReview[]): BriefReview | null {
  const withText = quotes.filter((q) => (q.text ?? "").trim().length >= 10);
  if (!withText.length) return null;
  const loud = (q: BriefReview) => ((q.text ?? "").includes("!") ? 1 : 0);
  return [...withText].sort((a, b) => loud(a) - loud(b) || b.rating - a.rating || (a.text ?? "").length - (b.text ?? "").length)[0];
}

const adLabel = (a: BriefAdStat) => a.ad ?? a.campaign ?? a.source;

// ── Shared lines ───────────────────────────────────────────────────────

/** The sentences every ad of the product may say, from the settings and the product: the shop's real promises. */
function promises(input: BriefInput) {
  const { product: p, shop: s } = input;
  const nameAr = p.nameAr?.trim() || p.name;
  const compare = p.compareAt != null && p.compareAt > p.price ? p.compareAt : null;

  const price: Lines = compare
    ? { fr: `${tnd(p.price)} au lieu de ${tnd(compare)}.`, ar: `السوم ${tnd(p.price, true)}، قبل كان ب ${tnd(compare, true)}.` }
    : { fr: `${tnd(p.price)}.`, ar: `السوم ${tnd(p.price, true)}.` };

  // "Livraison …", not "Livré …": the product's name may be feminine.
  const free = s.deliveryFee === 0;
  const feeAr = free ? "التوصيل بلاش" : `التوصيل ${tnd(s.deliveryFee, true)}`;
  let delivery: Lines;
  if (s.delivery) {
    const fr = deliveryRangeLabel(s.delivery.minDays, s.delivery.maxDays, "fr");
    const ar = deliveryRangeLabel(s.delivery.minDays, s.delivery.maxDays, "ar");
    const when = Math.max(s.delivery.minDays, s.delivery.maxDays) === 0 ? fr : `en ${fr}`;
    delivery = { fr: `Livraison ${when}${s.everywhere ? " partout en Tunisie" : ""}${free ? ", offerte" : ` : ${tnd(s.deliveryFee)}`}.`, ar: `يوصلك ${ar}${s.everywhere ? " لكل الولايات" : ""}، ${feeAr}.` };
  } else {
    delivery = { fr: free ? "Livraison offerte." : `Livraison : ${tnd(s.deliveryFee)}.`, ar: `${feeAr}.` };
  }
  const payment: Lines = s.openBeforePaying
    ? { fr: "Paiement à la livraison : vous ouvrez le colis avant de payer.", ar: "الخلاص عند الاستلام: تحلّ الكولي وتشوف قبل ما تخلّص." }
    : { fr: "Paiement à la livraison, rien à payer en ligne.", ar: "الخلاص عند الاستلام، ما تخلّص شي أونلاين." };
  const order: Lines = { fr: "Commandez sur le site, on vous appelle pour confirmer.", ar: "اطلب توّا من السيت ونعيطولك باش نأكدو." };
  const trust: Lines = s.openBeforePaying
    ? { fr: `${p.name} : vous voyez le produit avant de payer.`, ar: `${nameAr}: تشوفو قبل ما تخلّص.` }
    : { fr: `${p.name} : vous payez seulement à la réception.`, ar: `${nameAr}: ما تخلّص كان كي يوصلك.` };
  const summaryFr = p.summary.trim() ? firstSentence(p.summary) : null;
  const summaryAr = p.summaryAr?.trim() ? firstSentence(p.summaryAr) : null;
  // The name, then as much of the summary as the first line holds.
  const after = (name: string, summary: string | null) => (summary ? `${name}. ${firstSentence(summary, Math.max(40, LINE_MAX - name.length - 2))}` : `${name}.`);
  const benefit: Lines = { fr: after(p.name, summaryFr), ar: after(nameAr, summaryAr) };
  return { nameAr, compare, price, delivery, payment, order, trust, benefit, summaryFr, summaryAr };
}

type Shared = ReturnType<typeof promises>;

/** Lines → one text per language. */
const join = (...lines: Lines[]): Lines => ({ fr: lines.map((l) => l.fr).join("\n"), ar: lines.map((l) => l.ar).join("\n") });

/** TikTok's text: the headline, then "paid on delivery" when it fits in 100 characters. */
function caption(headline: Lines): Lines {
  const add = (h: string, tail: string) => (h.includes(tail) || `${h} · ${tail}`.length > CAPTION_MAX ? h.slice(0, CAPTION_MAX) : `${h} · ${tail}`);
  return { fr: add(headline.fr, "Paiement à la livraison"), ar: add(headline.ar, "الخلاص عند الاستلام") };
}

// ── Angles ─────────────────────────────────────────────────────────────

/** Every angle the product's facts allow, before ranking. A testimonial needs a real review; a problem needs the product's own summary. */
function angles(input: BriefInput, sh: Shared, hero: BriefOffer | null): Angle[] {
  const { product: p, reviews } = input;
  const out: Angle[] = [];
  const name = p.name;
  const nameAr = sh.nameAr;
  const tail = join(sh.price, sh.delivery, sh.payment, sh.order);
  const tailNoPrice = join(sh.delivery, sh.payment, sh.order);
  const priceHeadline: Lines = { fr: `${name} · ${tnd(p.price)}`, ar: `${nameAr} · ${tnd(p.price, true)}` };
  const add = (a: Omit<Angle, "adName" | "boost" | "caption">) => out.push({ ...a, boost: null, caption: caption(a.headline), adName: suggestAdName(p.slug, a.key === "beforeAfter" ? "avant-apres" : a.key) });

  add({
    key: "demo",
    title: "Démonstration",
    why: "Voir le produit en vrai vaut mieux qu'une promesse : on comprend en 3 secondes ce qu'il est et ce qu'il fait.",
    show: "Le produit qui fait son travail dès la première image, filmé au téléphone en gros plan, puis ses détails, puis le prix.",
    hook: { angle: "demo", visual: "Le produit en action dès la 1re seconde, sans logo ni introduction.", text: { fr: `${name}, sans filtre`, ar: `${nameAr} بلا فيلتر` } },
    primary: join(sh.benefit, tail),
    headline: priceHeadline,
    format: "video",
    caution: null,
  });

  if (sh.summaryFr || sh.summaryAr) {
    add({
      key: "problem",
      title: "Problème puis solution",
      why: "On s'arrête sur un problème qu'on connaît ; le produit arrive ensuite comme la réponse.",
      show: "2 secondes du problème que la fiche dit régler, sans parole, puis le produit qui le règle, puis le prix.",
      hook: { angle: "problem", visual: "Le problème du quotidien, reconnaissable tout de suite, filmé simplement.", text: { fr: capped(sh.summaryFr ?? name, 60), ar: capped(sh.summaryAr ?? nameAr, 60) } },
      primary: join(sh.benefit, tail),
      headline: priceHeadline,
      format: "video",
      caution: "Le problème montré est celui que la fiche décrit. Parlez du produit, pas de la personne : « Vous avez mal au dos ? » est refusé par Meta.",
    });
  }

  if (hero) {
    const perUnit = Math.round(hero.price / hero.quantity);
    const ends = hero.endsAt ? tunisDate(hero.endsAt) : null;
    const extraFr = `${hero.freeDelivery ? ", livraison offerte" : ""}${ends ? `, jusqu'au ${ends}` : ""}`;
    const extraAr = `${hero.freeDelivery ? "، التوصيل بلاش" : ""}${ends ? `، حتى ${ends}` : ""}`;
    const labelAr = hero.labelAr?.trim() || quantityAr(hero.quantity);
    const offerLine: Lines = { fr: `${name} : ${hero.label}, ${tnd(hero.price)}${extraFr}.`, ar: `${nameAr}: ${labelAr} ب ${tnd(hero.price, true)}${extraAr}.` };
    add({
      key: "offer",
      title: "Offre",
      why: `Le pack « ${hero.label} » met l'article à ${tnd(perUnit)} au lieu de ${tnd(p.price)} à l'unité : une raison concrète de commander maintenant, et un panier plus grand pour chaque colis payé.`,
      show: `Les ${hero.quantity} articles du pack côte à côte, le prix écrit en grand, puis le colis.`,
      hook: { angle: "offer", visual: "Le pack posé sur une table, le prix du pack écrit en grand dès la 1re seconde.", text: { fr: `${hero.label} · ${tnd(hero.price)}`, ar: `${labelAr} · ${tnd(hero.price, true)}` } },
      primary: join(offerLine, tailNoPrice),
      headline: { fr: `${hero.label} · ${tnd(hero.price)}`, ar: `${labelAr} · ${tnd(hero.price, true)}` },
      format: "static",
      caution: ends ? `Seule date à citer : la fin réelle de l'offre, le ${ends}. Aucune autre urgence.` : "L'offre n'a pas de date de fin : pas de compte à rebours ni de « dernier jour ».",
    });
  } else {
    add({
      key: "offer",
      title: sh.compare ? "Prix" : "Prix et paiement à la livraison",
      why: sh.compare
        ? `Le prix a réellement baissé : ${tnd(p.price)} au lieu de ${tnd(sh.compare)}. Le dire dès la publicité fait cliquer ceux que le prix convainc.`
        : "Le prix affiché dès la publicité fait cliquer ceux qu'il ne surprend pas : moins de commandes non confirmées, moins de refus.",
      show: "Le produit seul, bien éclairé, le prix écrit en grand, puis « Paiement à la livraison ».",
      hook: {
        angle: "offer",
        visual: "Le prix écrit sur l'image dès la 1re seconde, le produit en main.",
        text: sh.compare ? { fr: `${tnd(p.price)} au lieu de ${tnd(sh.compare)}`, ar: `${tnd(p.price, true)} عوض ${tnd(sh.compare, true)}` } : { fr: `${tnd(p.price)} · paiement à la livraison`, ar: `${tnd(p.price, true)} · الخلاص عند الاستلام` },
      },
      primary: join({ fr: `${name} : ${sh.price.fr}`, ar: `${nameAr}: ${sh.price.ar}` }, tailNoPrice),
      headline: priceHeadline,
      format: "static",
      caution: sh.compare ? `Prix barré : seulement l'ancien prix réel, ${tnd(sh.compare)}.` : "Pas de prix barré : la fiche n'a pas d'ancien prix.",
    });
  }

  const quote = bestQuote(reviews.quotes);
  if (quote && reviews.count > 0) {
    const text = (quote.text ?? "").replace(/\s+/g, " ").trim();
    const sign = `${quote.authorName}${quote.governorate ? `, ${quote.governorate}` : ""}`;
    const avg = reviews.average != null ? one(reviews.average) : null;
    const stats: Lines = avg
      ? { fr: `${avg}/5 sur ${reviews.count} avis de clients livrés.`, ar: `${avg}/5 حسب ${reviews.count} حريف وصلتهم الكوموند.` }
      : { fr: `${reviews.count} avis de clients livrés.`, ar: `${reviews.count} حريف وصلتهم الكوموند عطاو رايهم.` };
    add({
      key: "testimonial",
      title: "Avis de client",
      why: `${reviews.count} avis publiés de clients qui ont reçu le produit${avg ? `, ${avg}/5 en moyenne` : ""} : la parole d'un client rassure plus que celle de la boutique.`,
      show: "L'avis cité mot pour mot à l'écran, sur des images du produit. Pas d'acteur présenté comme un client.",
      hook: { angle: "testimonial", visual: "Le texte de l'avis en grand sur le produit, dès la 1re seconde.", text: { fr: `« ${capped(text, QUOTE_SCREEN_MAX)} »`, ar: `«${capped(text, QUOTE_SCREEN_MAX)}»` } },
      primary: join({ fr: `« ${text} » ${sign}`, ar: `«${text}» ${sign}` }, stats, tail),
      headline: avg ? { fr: `${avg}/5 · ${reviews.count} avis`, ar: `${avg}/5 · ${reviews.count} تقييم` } : priceHeadline,
      format: "video",
      caution: "Citez l'avis tel qu'il est publié, avec la signature choisie par le client. Ne le reformulez pas.",
    });
  }

  add({
    key: "unboxing",
    title: "Ce que vous recevez",
    why: "Le colis ouvert montre le vrai produit, sa vraie taille et tout ce qu'il y a dedans : les attentes sont réglées avant la commande, moins de surprises à la porte.",
    show: "Le colis ouvert à la main, tout son contenu posé sur une table, le produit pris en main pour montrer sa taille.",
    hook: { angle: "unboxing", visual: "Les mains ouvrent le colis dès la 1re seconde.", text: { fr: "Ce que vous recevez", ar: "شنوّة باش يوصلك" } },
    primary: join(sh.trust, sh.price, sh.delivery, sh.order),
    headline: { fr: "Paiement à la livraison", ar: "الخلاص عند الاستلام" },
    format: "video",
    caution: "Le contenu montré est exactement celui du colis : même couleur, même taille, mêmes accessoires.",
  });

  add({
    key: "beforeAfter",
    title: "Avant / après",
    why: "Quand le changement est réel, il se voit en une image : c'est l'accroche la plus rapide.",
    show: "Le même objet ou le même endroit, même cadre, même lumière : avant, puis après le produit. Sans retouche.",
    hook: { angle: "beforeAfter", visual: "L'image « avant » une seconde, puis une coupe nette sur « après ».", text: { fr: "Avant · Après", ar: "قبل · بعد" } },
    primary: join(sh.benefit, tail),
    headline: priceHeadline,
    format: "video",
    caution: "Seulement sur un objet ou un lieu, jamais sur le corps, la peau ou le poids : Meta et TikTok le refusent. Aucune retouche.",
  });

  add({
    key: "gift",
    title: "Idée cadeau",
    why: "Vu comme un cadeau, le même produit parle à ceux qui ne l'achèteraient pas pour eux : une autre audience à tester.",
    show: "Le produit emballé, puis ouvert par la personne à qui on l'offre. Une scène simple, filmée comme à la maison.",
    hook: { angle: "gift", visual: "Un paquet qu'on tend ; le produit apparaît dès la 2e seconde.", text: { fr: "Une idée de cadeau", ar: "تلوّج على هدية؟" } },
    primary: join({ fr: `Une idée de cadeau : ${name}.`, ar: `تلوّج على هدية؟ ${nameAr}.` }, tail),
    headline: { fr: `${name} · livraison à domicile`, ar: `${nameAr} · يوصلك لدارك` },
    format: "carousel",
    caution: null,
  });

  return out;
}

/** Default order: what usually wins first for a cash-on-delivery product, before the product's own data moves it. */
const BASE_RANK: Record<AngleKey, number> = { demo: 10, problem: 9, testimonial: 8.5, offer: 8, unboxing: 6, beforeAfter: 5, gift: 3 };
/** What each focus pushes up, and by how much. */
const FOCUS_BOOST: Partial<Record<Focus["key"], Partial<Record<AngleKey, number>>>> = {
  confirmation: { offer: 5, unboxing: 3 },
  delivery: { unboxing: 7, demo: 2 },
  page: { offer: 4 },
  pack: { offer: 3 },
};

function rank(list: Angle[], focus: Focus[]): Angle[] {
  const score = new Map<AngleKey, number>();
  const boost = new Map<AngleKey, string>();
  for (const a of list) score.set(a.key, BASE_RANK[a.key]);
  for (const f of focus) {
    for (const [key, add] of Object.entries(FOCUS_BOOST[f.key] ?? {}) as [AngleKey, number][]) {
      if (!score.has(key)) continue;
      score.set(key, (score.get(key) ?? 0) + add);
      if (!boost.has(key)) boost.set(key, f.title);
    }
  }
  return list.map((a) => ({ ...a, boost: boost.get(a.key) ?? null })).sort((a, b) => (score.get(b.key) ?? 0) - (score.get(a.key) ?? 0));
}

// ── Focus ──────────────────────────────────────────────────────────────

/** Only differences the counts can stand behind: a rate is called worse when its whole 95 % interval is under the reference. */
function focusOf(input: BriefInput): Focus[] {
  const { performance: f, baseline: b, product: p } = input;
  const out: Focus[] = [];
  const confirm = wilson(f.confirmed, f.decided);
  if (f.decided >= READ_MIN_DECIDED && confirm && b.confirmRate != null && confirm.high < b.confirmRate) {
    out.push({
      key: "confirmation",
      title: "Commandes de ce produit peu confirmées",
      evidence: `${plural(f.confirmed, "confirmée", "confirmées")} sur ${f.decided} (${pct(confirm.rate)}) contre ${pct(b.confirmRate)} pour la boutique, sur ${plural(f.days, "jour", "jours")}.`,
      action: "Dites le prix, les frais de livraison et l'appel de confirmation dans la publicité : ceux qui commandent sans intention se retirent d'eux-mêmes.",
    });
  }
  const parcels = f.delivered + f.back;
  const delivered = wilson(f.delivered, parcels);
  if (parcels >= READ_MIN_PARCELS && delivered && b.deliveryRate != null && delivered.high < b.deliveryRate) {
    const top = f.refusals[0];
    out.push({
      key: "delivery",
      title: "Beaucoup de colis refusés",
      evidence: `${plural(f.back, "colis revenu", "colis revenus")} sur ${parcels} (${pct(delivered.rate)} livrés) contre ${pct(b.deliveryRate)} pour la boutique.${top ? ` Premier motif : « ${top.reason} » (${top.count}).` : ""}`,
      action: "La publicité promet sans doute plus que le colis : filmez le vrai produit, sa taille en main et le contenu du colis, et dites le prix livraison comprise.",
    });
  }
  const page = wilson(f.formStarts, f.visits);
  const shopPage = f.shopVisits > 0 ? f.shopFormStarts / f.shopVisits : null;
  if (f.visits >= READ_MIN_VISITS && page && shopPage != null && page.high < shopPage) {
    out.push({
      key: "page",
      title: "La fiche convainc peu",
      evidence: `${plural(f.formStarts, "formulaire commencé", "formulaires commencés")} pour ${plural(f.visits, "visite", "visites")} de la fiche (${pct(page.rate)}), contre ${pct(shopPage)} sur l'ensemble des fiches.`,
      action: "Ceux qui cliquent ne s'attendaient pas à ce prix ou à cette offre : annoncez le prix dans la publicité, et testez un pack.",
    });
  }
  if (f.orders >= PACK_MIN_ORDERS && f.multiUnitOrders / f.orders >= PACK_SHARE) {
    out.push({
      key: "pack",
      title: "Les clients prennent souvent plusieurs articles",
      evidence: `${plural(f.multiUnitOrders, "commande", "commandes")} sur ${f.orders} (${pct(f.multiUnitOrders / f.orders)}) avec 2 articles ou plus.`,
      action: p.offers.some((o) => o.quantity >= 2) ? "Mettez le pack en avant dans la publicité." : "Créez un pack (2 articles à prix réduit) dans la fiche, puis testez-le en publicité.",
    });
  }
  const control = controlAd(f.ads);
  if (control) {
    out.push({
      key: "control",
      title: "Publicité témoin",
      evidence: `« ${adLabel(control)} » : ${plural(control.orders, "commande", "commandes")} pour ${plural(control.visits, "visite", "visites")} de la fiche (${pct(control.orders / control.visits)})${control.delivered ? `, ${plural(control.delivered, "livrée", "livrées")}` : ""}, sur ${plural(f.days, "jour", "jours")}.`,
      action: "Gardez-la active et comparez chaque nouvelle publicité à elle, avec le même budget.",
    });
  }
  if (f.visits === 0 && f.orders === 0) {
    out.push({
      key: "new",
      title: "Pas encore de résultats pour ce produit",
      evidence: `Aucune visite de la fiche en ${plural(f.days, "jour", "jours")}.`,
      action: "Lancez 3 angles différents (démonstration, offre, problème) avec le même budget, puis gardez le meilleur.",
    });
  }
  return out;
}

/** The ad to beat: enough visits and orders, then the best order rate at its lowest plausible value (not the luckiest small ad). */
function controlAd(ads: BriefAdStat[]): BriefAdStat | null {
  let best: { ad: BriefAdStat; low: number } | null = null;
  for (const a of ads) {
    if (a.visits < CONTROL_MIN_VISITS || a.orders < CONTROL_MIN_ORDERS) continue;
    const low = wilson(Math.min(a.orders, a.visits), a.visits)?.low ?? 0;
    if (!best || low > best.low) best = { ad: a, low };
  }
  return best?.ad ?? null;
}

// ── Formats, shots, rules ──────────────────────────────────────────────

export const FORMATS: Format[] = [
  {
    key: "video",
    label: "Vidéo verticale 9:16, 15 à 30 s",
    where: "Reels, Stories, TikTok",
    structure: [
      "0–3 s : l'accroche, le produit à l'image dès la 1re seconde",
      "3–10 s : le produit en action",
      "10–20 s : les détails qui comptent (taille, matière, contenu du colis)",
      "20–30 s : prix, livraison, paiement à la livraison, bouton",
    ],
    tips: [
      "Sous-titres incrustés : la plupart regardent sans le son.",
      "Texte loin des bords : le bas et la droite sont couverts par les boutons de TikTok et Reels.",
      "Filmé au téléphone, à la lumière du jour : ça ressemble à ce que les gens postent.",
      "Voix en derja, musique de la bibliothèque commerciale de la plateforme.",
    ],
  },
  {
    key: "carousel",
    label: "Carrousel 1:1 ou 4:5, 3 à 5 cartes",
    where: "Fil Facebook et Instagram",
    structure: ["1 : le produit et la phrase la plus forte", "2 : le détail qui compte (taille, matière)", "3 : le produit utilisé", "4 : le prix ou l'offre", "5 : livraison et paiement à la livraison"],
    tips: ["Une idée par carte, peu de texte.", "La 1re carte doit donner envie de glisser."],
  },
  {
    key: "static",
    label: "Image 4:5",
    where: "Fil Facebook et Instagram",
    structure: ["Le produit seul sur un fond simple, bien éclairé", "Le prix et « Paiement à la livraison » lisibles sur un téléphone"],
    tips: ["Une phrase, le prix, le bouton : rien de plus.", "La version la plus rapide à tester contre une vidéo."],
  },
];

function shots(input: BriefInput, specs: { label: string; value: string }[], hero: BriefOffer | null): string[] {
  const p = input.product;
  const out = ["Le produit en main, à la lumière du jour, filmé au téléphone.", "Le produit qui fait son travail, en gros plan : c'est l'accroche."];
  for (const s of specs.slice(0, 3)) out.push(`Un plan qui montre « ${s.label} : ${s.value} ».`);
  if (specs.some((s) => SIZE_RE.test(s.label))) out.push("La vraie taille : le produit dans la main ou à côté d'un objet connu.");
  if (p.variants.length >= 2) out.push(`Chaque choix proposé, côte à côte : ${p.variants.map((v) => v.name).join(", ")}.`);
  if (hero) out.push(`Les ${hero.quantity} articles du pack « ${hero.label} » côte à côte.`);
  out.push("Le colis ouvert, tout son contenu posé sur une table.");
  out.push("Image de fin : le prix, la livraison, « Paiement à la livraison ».");
  return out;
}

function compliance(input: BriefInput, sh: Shared): string[] {
  const { product: p, shop: s, reviews } = input;
  const dated = p.offers.filter((o) => o.endsAt);
  const freeOffer = p.offers.find((o) => o.freeDelivery);
  const out = [
    dated.length
      ? `Pas de fausse urgence : ni « stock limité », ni « plus que 3 », ni compte à rebours. Seule date à citer : la fin réelle de ${dated.map((o) => `« ${o.label} » (${tunisDate(o.endsAt!)})`).join(", ")}.`
      : "Pas de fausse urgence : ni « stock limité », ni « plus que 3 », ni compte à rebours. Aucune offre de ce produit n'a de date de fin.",
    reviews.count > 0
      ? "Pas de faux avis : un acteur ne se présente pas comme client, et un avis cité l'est mot pour mot, avec la signature publiée."
      : "Aucun avis publié pour ce produit : pas de témoignage, et aucun acteur présenté comme client.",
    "Aucune promesse de santé, de beauté ou de résultat chiffré que la fiche ne fait pas.",
    "Avant / après : seulement sur un objet ou un lieu, jamais sur le corps, la peau ou le poids.",
    "Parlez du produit, pas de la personne : « Vous avez mal au dos ? », « Vous êtes endetté ? » sont refusés par Meta.",
    sh.compare ? `Prix : ${tnd(p.price)}. Prix barré : seulement l'ancien prix réel, ${tnd(sh.compare)}.` : `Prix : ${tnd(p.price)}, sans prix barré (la fiche n'a pas d'ancien prix).`,
    s.delivery
      ? `Délai : ${deliveryRangeLabel(s.delivery.minDays, s.delivery.maxDays, "fr")}, comme dans Paramètres, carte « Livraison ». Jamais « 24 h » si ce n'est pas le délai réel.`
      : "Aucune zone de livraison active dans Paramètres, carte « Livraison » : ne promettez pas de délai.",
    s.deliveryFee === 0
      ? "Livraison offerte : oui, pour toutes les commandes."
      : `Livraison : ${tnd(s.deliveryFee)}. « Livraison offerte » seulement ${[freeOffer ? `avec l'offre « ${freeOffer.label} »` : null, s.freeThreshold != null ? `dès ${tnd(s.freeThreshold)} d'achat` : null].filter(Boolean).join(" ou ") || "jamais : elle est payante"}.`,
    s.openBeforePaying ? "Paiement à la livraison, et le client ouvre le colis avant de payer : les deux peuvent être dits." : "Paiement à la livraison : oui. « Ouvrir avant de payer » : non, ce n'est pas coché dans Paramètres, carte « Livraison ».",
    "Le produit filmé est celui qui part dans le colis : même couleur, même taille, même contenu.",
    "Musique : celle de la bibliothèque commerciale de la plateforme.",
  ];
  return out;
}

function facts(input: BriefInput, sh: Shared, specs: { label: string; value: string }[], specsAr: { label: string; value: string }[]): Fact[] {
  const { product: p, shop: s, reviews } = input;
  const out: Fact[] = [
    { label: "Nom", fr: p.name, ar: p.nameAr?.trim() || null },
    { label: "Prix", fr: tnd(p.price), ar: tnd(p.price, true) },
  ];
  if (sh.compare) out.push({ label: "Ancien prix réel", fr: tnd(sh.compare), ar: tnd(sh.compare, true) });
  if (sh.summaryFr || sh.summaryAr) out.push({ label: "Description courte", fr: p.summary.trim(), ar: p.summaryAr?.trim() || null });
  if (p.category) out.push({ label: "Catégorie", fr: p.category, ar: p.categoryAr });
  for (const o of p.offers) {
    const ends = o.endsAt ? tunisDate(o.endsAt) : null;
    out.push({
      label: "Offre",
      fr: `${o.label} : ${tnd(o.price)} pour ${o.quantity}${o.freeDelivery ? ", livraison offerte" : ""}${ends ? `, jusqu'au ${ends}` : ""}`,
      ar: o.labelAr ? `${o.labelAr}: ${tnd(o.price, true)}${o.freeDelivery ? "، التوصيل بلاش" : ""}${ends ? `، حتى ${ends}` : ""}` : null,
    });
  }
  if (p.variants.length) out.push({ label: "Choix", fr: p.variants.map((v) => v.name).join(", "), ar: p.variants.every((v) => v.nameAr) ? p.variants.map((v) => v.nameAr).join("، ") : null });
  specs.forEach((sp, i) => out.push({ label: sp.label, fr: sp.value, ar: specsAr[i] ? `${specsAr[i].label}: ${specsAr[i].value}` : null }));
  out.push({ label: "Livraison", fr: sh.delivery.fr, ar: sh.delivery.ar });
  if (s.freeThreshold != null && s.deliveryFee > 0) out.push({ label: "Livraison offerte", fr: `Dès ${tnd(s.freeThreshold)} d'achat`, ar: `التوصيل بلاش كي تشري ب ${tnd(s.freeThreshold, true)} ولا أكثر` });
  out.push({ label: "Paiement", fr: sh.payment.fr, ar: sh.payment.ar });
  out.push({ label: "Confirmation", fr: "On appelle le client pour confirmer avant l'envoi.", ar: "نعيطو للحريف باش نأكدو قبل ما نبعثو." });
  out.push({ label: "Retours", fr: `Retour possible sous ${s.returnDays} jours après la livraison.`, ar: `تنجم ترجّعو خلال ${s.returnDays} ${s.returnDays <= 10 ? "أيام" : "يوم"} بعد ما يوصلك.` });
  if (reviews.count > 0) out.push({ label: "Avis publiés", fr: `${reviews.count}${reviews.average != null ? `, ${one(reviews.average)}/5 en moyenne` : ""}`, ar: null });
  return out;
}

const MISSING_INPUT: Partial<Record<BreakEvenInput, string>> = {
  unitCost: "le coût fournisseur du produit (sa fiche, dans Produits)",
  carrierCost: "le coût du transporteur par colis (Paramètres, carte « Livraison »)",
  returnCost: "le coût d'un colis qui revient (Paramètres, carte « Livraison »)",
  confirmRate: "un taux de confirmation (aucune commande décidée)",
  deliveryRate: "un taux de livraison (aucun colis livré ou revenu)",
};

function ceilings(input: BriefInput): Ceilings {
  const { product: p, shop: s, performance: f, baseline: b } = input;
  // The product's own rates pulled toward the shop's, like kpis.ts reads a young row.
  const confirmRate = shrink(f.confirmed, f.decided, b.confirmRate, CONFIRM_PRIOR_ORDERS);
  const deliveryRate = shrink(f.delivered, f.delivered + f.back, b.deliveryRate, DELIVERY_PRIOR_PARCELS);
  const rows = productBreakEvens(
    { price: p.price, cost: p.cost, offers: p.offers.map((o) => ({ id: o.id, label: o.label, quantity: o.quantity, price: o.price, freeDelivery: o.freeDelivery })) },
    { deliveryFee: s.deliveryFee, freeThreshold: s.freeThreshold, carrierPerParcel: s.carrierPerParcel, returnPerParcel: s.returnPerParcel, confirmRate, deliveryRate },
  );
  const missing = new Set<string>();
  for (const r of rows) for (const m of r.result.missing) if (MISSING_INPUT[m]) missing.add(MISSING_INPUT[m]!);
  const unit = rows[0];
  // An offer of one unit at the unit price, without free delivery, is the unit itself: shown once.
  const distinct = rows.filter((r, i) => i === 0 || !(r.units === 1 && r.input.price === unit.input.price && r.input.deliveryFee === unit.input.deliveryFee));
  return {
    rows: distinct.map((r) => ({ key: r.key, label: r.label, units: r.units, margin: r.result.margin, maxCostPerDelivered: r.result.maxCostPerDelivered, maxCpa: r.result.maxCpa })),
    confirmRate,
    deliveryRate,
    missing: [...missing],
  };
}

function tests(input: BriefInput, list: Angle[], c: Ceilings, hero: BriefOffer | null): string[] {
  const control = controlAd(input.performance.ads);
  const unit = c.rows[0];
  const pack = hero ? c.rows.find((r) => r.key === hero.id) : null;
  const out: string[] = [];
  if (control) out.push(`Témoin : « ${adLabel(control)} » (${plural(control.orders, "commande", "commandes")} pour ${plural(control.visits, "visite", "visites")} de la fiche). Chaque nouvelle publicité se compare à elle.`);
  out.push("3 à 5 publicités dans un même ensemble de test, une seule différence chacune. L'accroche d'abord : ce sont les 3 premières secondes qui décident. La plateforme donne plus de budget à celle qu'elle préfère : jugez chacune sur son coût par livrée, pas sur sa part du budget.");
  out.push(`Nommez chaque publicité comme son angle (${list.slice(0, 3).map((a) => a.adName).join(", ")}) et utilisez le lien avec le code du nom de la publicité : l'onglet Créatives les compare tout seul.`);
  if (unit?.maxCostPerDelivered != null && unit.maxCpa != null) {
    out.push(`À l'unité, une commande livrée peut coûter au plus ${tnd(unit.maxCostPerDelivered)} en publicité, une commande passée ${tnd(unit.maxCpa)} (estimation d'après la confirmation et la livraison de ce produit, rapprochées de celles de la boutique).`);
    if (unit.maxCostPerDelivered > 0) out.push(`Jugez une publicité après environ ${tnd(unit.maxCostPerDelivered * JUDGE_SPEND_MULTIPLE)} de dépense ou ${JUDGE_MIN_ORDERS} commandes : avant, l'écart peut être du hasard.`);
    else out.push("La marge à l'unité est nulle ou négative : la publicité ne peut que perdre de l'argent sur 1 article. Testez d'abord un pack ou un autre prix.");
  } else {
    out.push(`Plafond de coût inconnu : il manque ${c.missing.join(", ") || "des données"}.`);
  }
  if (hero && pack?.margin != null && unit?.margin != null && pack.margin !== unit.margin) {
    out.push(
      pack.margin > unit.margin
        ? `Le pack « ${hero.label} » laisse ${tnd(pack.margin)} par commande livrée avant publicité, contre ${tnd(unit.margin)} à l'unité : c'est l'offre à mettre en avant.`
        : `Le pack « ${hero.label} » laisse moins par commande livrée (${tnd(pack.margin)} contre ${tnd(unit.margin)} à l'unité) : il vend plus d'articles, mais chaque commande peut coûter moins en publicité.`,
    );
  }
  out.push("Dans Ads Manager, lisez le taux d'accroche (lectures de 3 secondes ÷ impressions) et le CTR lien. Ici, lisez les commandes par visite, la confirmation, la livraison et le coût par commande livrée.");
  out.push("Une publicité qui fait commander mais dont les commandes ne sont pas confirmées attire des curieux : son coût par commande bas ne compte pas, seul son coût par commande livrée décide.");
  return out;
}

// ── Brief ──────────────────────────────────────────────────────────────

export function buildBrief(input: BriefInput): Brief {
  const now = Date.parse(input.asOf);
  const product = { ...input.product, offers: input.product.offers.filter((o) => !o.endsAt || !(Date.parse(o.endsAt) <= now)) };
  const i: BriefInput = { ...input, product };
  const p = product;
  const sh = promises(i);
  const specs = specLines(p.specs);
  const specsAr = specLines(p.specsAr);
  const focus = focusOf(i);
  const c = ceilings(i);
  const hero = heroOffer(p.offers, c);
  const list = rank(angles(i, sh, hero), focus);

  const extra: Hook[] = [];
  const size = specs.findIndex((s) => SIZE_RE.test(s.label));
  if (size >= 0) {
    const fr = specs[size];
    const ar = specsAr[size];
    extra.push({ angle: null, visual: "La vraie taille, en main, avec la mesure écrite à l'écran.", text: { fr: `${fr.label} : ${fr.value}`, ar: ar ? `${ar.label}: ${ar.value}` : `${fr.label} : ${fr.value}` } });
  }
  if (p.variants.length >= 2) {
    const ar = p.variants.map((v) => v.nameAr?.trim() || v.name).join("، ");
    extra.push({ angle: null, visual: "Tous les choix côte à côte ; la main passe de l'un à l'autre.", text: { fr: `Au choix : ${p.variants.map((v) => v.name).join(", ")}`, ar: `متوفّر في: ${ar}` } });
  }
  for (const s of i.performance.searches.slice(0, 2)) {
    extra.push({ angle: null, visual: `Le mot que tapent les clients (« ${s.q} », ${plural(s.count, "recherche", "recherches")}), écrit à l'écran, puis le produit.`, text: { fr: s.q, ar: s.q } });
  }
  extra.push({ angle: null, visual: "« Paiement à la livraison » à l'écran pendant qu'on déballe.", text: { fr: "Vous payez à la réception", ar: "ما تخلّص كان كي يوصلك" } });

  const assets: string[] = [];
  if (p.hasVideo) assets.push("Une vidéo est déjà sur la fiche : ses plans peuvent servir de base.");
  if (p.photos >= 3) assets.push(`${p.photos} photos sur la fiche : assez pour un premier carrousel.`);
  else assets.push(`${plural(p.photos, "photo", "photos")} sur la fiche : filmez ou photographiez le produit avant de lancer.`);

  const missing: string[] = [];
  if (!p.summary.trim()) missing.push("Pas de description courte en français : les textes reprennent seulement le nom et le prix.");
  if (!p.nameAr?.trim() || !p.summaryAr?.trim()) missing.push("Nom ou description courte en arabe manquants : traduisez la fiche, sinon la version derja reprend le nom français.");
  if (c.missing.length) missing.push(`Plafonds de coût incomplets : il manque ${c.missing.join(", ")}.`);
  if (input.reviews.count === 0) missing.push("Aucun avis publié : pas d'angle témoignage pour l'instant.");
  if (i.performance.visits === 0) missing.push(`Aucune visite de la fiche en ${plural(i.performance.days, "jour", "jours")} : le brief ne s'appuie pas encore sur des résultats.`);
  if (!p.active) missing.push("Le produit n'est pas en ligne : la publicité mènerait à une page introuvable.");
  else if (!p.available) missing.push("Le produit est marqué indisponible : ne lancez pas de publicité avant son retour.");

  return {
    focus,
    angles: list,
    hooks: [...list.map((a) => a.hook), ...extra],
    formats: FORMATS,
    assets,
    shots: shots(i, specs, hero),
    cta: { button: "« Commander » ou « Acheter », sur Meta comme sur TikTok", text: { fr: "Commandez sur le site, vous payez à la livraison.", ar: "اطلب توّا وخلّص كي تستلم." } },
    facts: facts(i, sh, specs, specsAr),
    compliance: compliance(i, sh),
    tests: tests(i, list, c, hero),
    ceilings: c,
    missing,
    days: i.performance.days,
  };
}

// ── Copy check ─────────────────────────────────────────────────────────

const SCARCITY = /stock limit|quantit[ée]s? limit|derni[eè]res? (pi[eè]ces|unit[ée]s|chances?)|plus que \d|d[ée]p[êe]chez|vite,|ne ratez pas|avant rupture|آخر (حبّات|حبات|قطع)|محدود|قبل ما يوفى|ما تفوّتش|بالخف/i;
const HEALTH = /gu[ée]ri(t|r|son)|\bsoigne(r|z)?\b|maladie|douleur|mincir|maigrir|perte de poids|anti[- ]?(rides|âge|chute)|m[ée]dical|cicatris|علاج|يداوي|دواء|وجيعة|تنحيف|ينحّف/i;
const FREE = /gratuit|offert|بلاش|مجاني|مجّاني/i;
const SPEED = /\b(24|48) ?h|\b(24|48) ?heures|نفس النهار|24 ساعة|48 ساعة/i;
const OPEN = /avant de payer|قبل ما تخلّص|تحلّ الكولي/;
const PERCENT = /%|٪|pour ?cent|بالمية/i;
/** Amounts with their currency, as the shop writes them ("59,900 DT", "59,900 د.ت") or not ("60 dinars"). Bare numbers are sizes and counts. */
const AMOUNT = /(\d{1,6})(?:[.,](\d{1,3}))?\s?(?:DT|TND|dt|dinars?|د\.ت|دينار|دنانير)/g;

/**
 * What in an ad text breaks the rules: a price the site does not show, an
 * urgency or a free delivery that does not exist, a health promise, a delay
 * shorter than the settings, "open before paying" when the carrier does not
 * allow it, exclamation marks. Each warning is short French. Used on the
 * brief's own texts (tested) and on generated concepts.
 */
export function copyWarnings(text: string, input: BriefInput): string[] {
  const { product: p, shop: s } = input;
  const out = new Set<string>();
  if (text.includes("!")) out.add("Point d'exclamation : la boutique n'en met pas.");
  if (/\p{Extended_Pictographic}/u.test(text)) out.add("Émoji : la boutique n'en met pas.");
  if (SCARCITY.test(text)) out.add("Urgence ou rareté que rien ne prouve.");
  if (HEALTH.test(text)) out.add("Promesse de santé ou de résultat : refusée par Meta et TikTok.");
  const freeReal = s.deliveryFee === 0 || s.freeThreshold != null || p.offers.some((o) => o.freeDelivery || FREE.test(o.label) || FREE.test(o.labelAr ?? ""));
  if (FREE.test(text) && !freeReal) out.add("« Gratuit » ou « offert » sans offre réelle.");
  if (SPEED.test(text) && (!s.delivery || Math.max(s.delivery.minDays, s.delivery.maxDays) > 1)) out.add("Délai plus court que celui des réglages.");
  if (OPEN.test(text) && !s.openBeforePaying) out.add("« Ouvrir avant de payer » alors que les réglages ne le permettent pas.");
  if (PERCENT.test(text) && !PERCENT.test(`${p.summary} ${p.specs} ${p.summaryAr ?? ""} ${p.specsAr ?? ""} ${p.offers.map((o) => `${o.label} ${o.labelAr ?? ""}`).join(" ")}`)) out.add("Pourcentage que la fiche ne donne pas.");

  const allowed = new Set<number>([p.price, s.deliveryFee, p.price + s.deliveryFee]);
  if (p.compareAt != null) allowed.add(p.compareAt);
  if (s.freeThreshold != null) allowed.add(s.freeThreshold);
  for (const o of p.offers) {
    allowed.add(o.price);
    allowed.add(Math.round(o.price / o.quantity));
    if (!o.freeDelivery) allowed.add(o.price + s.deliveryFee);
  }
  for (const m of text.matchAll(AMOUNT)) {
    const millimes = Number(m[1]) * 1000 + Number((m[2] ?? "").padEnd(3, "0"));
    if (!allowed.has(millimes)) out.add(`Montant absent de la fiche et des réglages : ${m[0].trim()}.`);
  }
  return [...out];
}
