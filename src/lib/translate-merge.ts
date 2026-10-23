/**
 * What a translation may change, decided here and not by the model: only the
 * fields that were asked for. "fill" writes a text only where it was empty
 * and its other-language counterpart was not; "to-ar" rewrites the Arabic of
 * every text that has a French version. Keywords, and the title and
 * description for Google, are written only when empty (in both languages).
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
  seoTitle: string;
  seoTitleAr: string;
  seoDescription: string;
  seoDescriptionAr: string;
  variants: { name: string; nameAr: string }[];
  offers: { label: string; labelAr: string }[];
};

/** What Google shows: written in both languages when neither is, otherwise translated like the other texts. */
const SEO = [
  ["seoTitle", "seoTitleAr", 120],
  ["seoDescription", "seoDescriptionAr", 320],
] as const;

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
  const oneLine = (v: string | undefined, max: number) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  for (const [fr, ar, max] of SEO) {
    const [a, b] = !filled(before[fr]) && !filled(before[ar]) ? [answer[fr], answer[ar]] : pick(mode, before[fr], before[ar], answer[fr], answer[ar]);
    [out[fr], out[ar]] = [oneLine(a, max), oneLine(b, max)];
  }
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

/** The texts of a product form, and the form with translated texts put back (options and offers by position). */
type WithTexts = Omit<ProductTexts, "variants" | "offers"> & {
  variants: { name: string; nameAr?: string }[];
  offers: { label: string; labelAr: string }[];
};
export function textsOfProduct(p: WithTexts): ProductTexts {
  return {
    name: p.name, nameAr: p.nameAr, summary: p.summary, summaryAr: p.summaryAr, description: p.description, descriptionAr: p.descriptionAr,
    specs: p.specs, specsAr: p.specsAr, keywords: p.keywords,
    seoTitle: p.seoTitle, seoTitleAr: p.seoTitleAr, seoDescription: p.seoDescription, seoDescriptionAr: p.seoDescriptionAr,
    variants: p.variants.map((v) => ({ name: v.name, nameAr: v.nameAr ?? "" })),
    offers: p.offers.map((o) => ({ label: o.label, labelAr: o.labelAr })),
  };
}
export function withProductTexts<P extends WithTexts>(p: P, t: ProductTexts): P {
  return {
    ...p, ...t,
    variants: p.variants.map((v, i) => ({ ...v, name: t.variants[i]?.name ?? v.name, nameAr: t.variants[i]?.nameAr ?? v.nameAr })),
    offers: p.offers.map((o, i) => ({ ...o, label: t.offers[i]?.label ?? o.label, labelAr: t.offers[i]?.labelAr ?? o.labelAr })),
  };
}
/** A text written in one language only, or no keywords or Google texts yet: something for a translation to do. */
export function needsTranslation(t: ProductTexts): boolean {
  const one = (a: string | undefined, b: string | undefined) => filled(a) !== filled(b);
  const named = filled(t.name) || filled(t.nameAr);
  const none = (a: string | undefined, b: string | undefined) => named && !filled(a) && !filled(b);
  return (
    one(t.name, t.nameAr) || one(t.summary, t.summaryAr) || one(t.description, t.descriptionAr) || one(t.specs, t.specsAr) ||
    one(t.seoTitle, t.seoTitleAr) || one(t.seoDescription, t.seoDescriptionAr) || none(t.seoTitle, t.seoTitleAr) || none(t.seoDescription, t.seoDescriptionAr) ||
    (!filled(t.keywords) && named) ||
    t.variants.some((v) => one(v.name, v.nameAr)) || t.offers.some((o) => one(o.label, o.labelAr))
  );
}
