/**
 * What a translation may change, decided here and not by the model: only the
 * fields that were asked for. "fill" writes a text only where it was empty
 * and its other-language counterpart was not; "to-ar" rewrites the Arabic of
 * every text that has a French version. Keywords are written only when empty.
 */
export type TranslateMode = "fill" | "to-ar";

export type ProductTexts = {
  name: string;
  nameAr: string;
  summary: string;
  summaryAr: string;
  description: string;
  descriptionAr: string;
  specs: string;
  specsAr: string;
  keywords: string;
  variants: { name: string; nameAr: string }[];
  offers: { label: string; labelAr: string }[];
};

const PAIRS = [
  ["name", "nameAr"],
  ["summary", "summaryAr"],
  ["description", "descriptionAr"],
  ["specs", "specsAr"],
] as const;

const filled = (s: string | undefined) => Boolean(s && s.trim());

/** One French/Arabic pair: the value to keep for each side. */
function pick(mode: TranslateMode, fr: string, ar: string, newFr: string | undefined, newAr: string | undefined): [string, string] {
  if (mode === "to-ar") return [fr, filled(fr) && filled(newAr) ? newAr!.trim() : ar];
  if (!filled(fr) && filled(ar) && filled(newFr)) return [newFr!.trim(), ar];
  if (filled(fr) && !filled(ar) && filled(newAr)) return [fr, newAr!.trim()];
  return [fr, ar];
}

export function mergeTranslation(before: ProductTexts, answer: ProductTexts, mode: TranslateMode): ProductTexts {
  const out: ProductTexts = { ...before, variants: [...before.variants], offers: [...before.offers] };
  for (const [fr, ar] of PAIRS) [out[fr], out[ar]] = pick(mode, before[fr], before[ar], answer[fr], answer[ar]);
  if (!filled(before.keywords) && filled(answer.keywords)) out.keywords = answer.keywords.trim().slice(0, 1000);
  // Options and offers are matched by position; a list of another length is ignored.
  if (answer.variants.length === before.variants.length)
    out.variants = before.variants.map((v, i) => {
      const [name, nameAr] = pick(mode, v.name, v.nameAr, answer.variants[i].name, answer.variants[i].nameAr);
      return { name: name.slice(0, 60), nameAr: nameAr.slice(0, 60) };
    });
  if (answer.offers.length === before.offers.length)
    out.offers = before.offers.map((o, i) => {
      const [label, labelAr] = pick(mode, o.label, o.labelAr, answer.offers[i].label, answer.offers[i].labelAr);
      return { label: label.slice(0, 80), labelAr: labelAr.slice(0, 80) };
    });
  // The short description stays within what the editor accepts.
  out.summary = out.summary.slice(0, 300);
  out.summaryAr = out.summaryAr.slice(0, 300);
  return out;
}
