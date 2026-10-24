import { dict, type Lang } from "@/i18n";

/**
 * An offer's title is its quantity, written by the shop itself ("زوز حبات",
 * "3 unités"): always true. The name the owner typed ("Achetez 2, la 3e
 * offerte") is shown under it only when it says the same number of units
 * and says something more than that number. A name like "الثانية" alone, or
 * "la 3e offerte" on an offer of 2 units, would promise what the parcel does
 * not hold, and a cash-on-delivery parcel is then refused at the door.
 */

const AR_WORDS: [RegExp, number][] = [
  [/^(?:وحدة|واحدة|واحد)$/, 1],
  [/^(?:زوز|زوزي|ثنين|اثنين|إثنين)$/, 2],
  [/^(?:ثاني|ثانية|الثاني|الثانية)$/, 2],
  [/^(?:ثلاثة|ثلاث|تلاثة|تلاث)$/, 3],
  [/^(?:ثالث|ثالثة|الثالث|الثالثة)$/, 3],
  [/^(?:أربعة|اربعة|ربعة|أربع|اربع)$/, 4],
  [/^(?:رابع|رابعة|الرابع|الرابعة)$/, 4],
  [/^(?:خمسة|خمس)$/, 5],
  [/^(?:خامس|خامسة|الخامس|الخامسة)$/, 5],
];
const FR_WORDS: Record<string, number> = {
  deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6,
  deuxieme: 2, second: 2, seconde: 2, troisieme: 3, quatrieme: 4, cinquieme: 5,
};
/** Words that only name a unit or a pack: "1 unité", "Lot de 2", "حبة وحدة" say nothing more than the title. */
const UNIT_WORDS = /^(?:unites?|pieces?|pcs?|articles?|produits?|x|lot|pack|de|du|des|d|le|la|les|l|par|en|حبة|حبات|حبّة|حبّات|قطعة|قطع|حاجة|باكو)$/;

/** Western digits for Arabic-Indic ones. */
const latinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
const plain = (s: string) => latinDigits(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** An Arabic word without "و", "ب", "ل" in front: "والثالثة" → "الثالثة". */
const arabicStem = (w: string) => w.replace(/^(?:و|ب|ف)(?=ال)/, "").replace(/^(?:و)(?=[^ا])/, "");

function wordValue(w: string): number | null {
  if (/[؀-ۿ]/.test(w)) {
    for (const cand of [w, arabicStem(w)]) for (const [re, n] of AR_WORDS) if (re.test(cand)) return n;
    return null;
  }
  return FR_WORDS[w] ?? null;
}

/**
 * How many units a name speaks of, or null when it names none. A number is a
 * count when it is small enough to be one (an offer holds at most 50) and is
 * not a price, a percentage or a measure ("-20 %", "80 DT", "500 ml").
 */
export function unitsInLabel(label: string): number | null {
  const s = plain(label);
  const found: number[] = [];
  for (const m of s.matchAll(/(\d+)\s*\+\s*(\d+)/g)) found.push(Number(m[1]) + Number(m[2]));
  for (const m of s.matchAll(/(?<![\d.,])(\d+)(?!\d)(?![.,]\d)\s*(%|dt\b|tnd\b|د\.?ت|دينار|dinars?\b|millimes?\b|ml\b|cl\b|l\b|kg\b|g\b|cm\b|mm\b|m\b|w\b|v\b|°|h\b|mois\b|ans?\b|jours?\b|min\b|ثواني|دقايق|ساعة|سوايع|شهر|عام|سنين|بالمية)?/g)) {
    const n = Number(m[1]);
    if (m[2] || n < 1 || n > 50) continue;
    found.push(n);
  }
  for (const w of s.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    const ord = /^(\d+)(?:e|eme|er|re|ere)$/.exec(w);
    if (ord) found.push(Number(ord[1]));
    const v = wordValue(w);
    if (v != null) found.push(v);
  }
  return found.length ? Math.max(...found) : null;
}

/** True when the name says nothing about the number of units, or says the offer's own. */
export const labelFits = (label: string | null | undefined, quantity: number) => {
  if (!label?.trim()) return true;
  const n = unitsInLabel(label);
  return n == null || n === quantity;
};

/** True when the name says more than a number of units ("Achetez 2, la 3e offerte", not "الثانية" or "2 unités"). */
export function labelAdds(label: string | null | undefined): boolean {
  if (!label?.trim()) return false;
  return plain(label)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .some((w) => !/^\d+(?:e|eme|er|re|ere)?$/.test(w) && wordValue(w) == null && !UNIT_WORDS.test(w) && /\p{L}/u.test(w));
}

type Named = { quantity: number; label: string | null; labelAr: string | null };

/** The offer's name in a language, kept only when it fits and adds something; otherwise null. */
export function offerNote(o: Named, lang: Lang): string | null {
  const own = lang === "ar" ? o.labelAr : o.label;
  // A name only in French is not shown on the Arabic page (and the other way round).
  if (!own || !labelFits(own, o.quantity) || !labelAdds(own)) return null;
  return own.trim();
}

/** The title of an offer: its quantity, in the shop's words. */
export const offerTitle = (o: { quantity: number }, lang: Lang) => dict(lang).buy.units(o.quantity);

/** Title and note on one line, for the cart, the order and the messages. */
export function offerLine(o: Named, lang: Lang): string {
  const note = offerNote(o, lang);
  return note ? `${offerTitle(o, lang)} · ${note}` : offerTitle(o, lang);
}

/** The first name of an offer that speaks of another quantity, for the editor's refusal. */
export function offerLabelProblem(o: Named): string | null {
  for (const l of [o.label, o.labelAr]) {
    if (l && !labelFits(l, o.quantity)) return `le nom « ${l.trim()} » annonce ${unitsInLabel(l)} unités, mais la quantité est ${o.quantity}`;
  }
  return null;
}
