import { offerLabelProblem } from "./offer-label";

/**
 * How complete a product page is, out of 100, and what it lacks: the
 * owner's list of what to do before advertising a product. Each point is
 * something a customer sees (or Google reads); a product loses only the
 * points of what is missing. Nothing here judges the product itself.
 */

export type QualityInput = {
  nameAr: string | null;
  summary: string;
  summaryAr: string | null;
  description: string;
  descriptionAr: string | null;
  specs: string;
  keywords: string;
  seoTitle: string;
  seoDescription: string;
  categoryId: string | null;
  cost: number | null;
  videoUrl: string | null;
  checkedAt: Date | null;
  /** Photos at the top of the page, and long pictures under the description. */
  gallery: number;
  details: number;
  offers: { quantity: number; label: string; labelAr: string | null; active: boolean }[];
};

export const CHECKS = [
  { key: "photos", label: "Photos", max: 15 },
  { key: "details", label: "Grandes images de description", max: 15 },
  { key: "description", label: "Description", max: 10 },
  { key: "arabic", label: "Arabe", max: 10 },
  { key: "checked", label: "Vérifiée avec le fournisseur", max: 10 },
  { key: "summary", label: "Phrase sous le nom", max: 5 },
  { key: "specs", label: "Caractéristiques", max: 5 },
  { key: "category", label: "Catégorie", max: 5 },
  { key: "google", label: "Titre et description Google", max: 5 },
  { key: "keywords", label: "Mots-clés de recherche", max: 5 },
  { key: "cost", label: "Coût fournisseur", max: 5 },
  { key: "video", label: "Vidéo", max: 5 },
  { key: "offers", label: "Offres cohérentes", max: 5 },
] as const;
export type QualityKey = (typeof CHECKS)[number]["key"];

/** One thing missing: its points lost, and what to do, in the owner's words. */
export type Missing = { key: QualityKey; lost: number; text: string };

const filled = (s: string | null | undefined) => Boolean(s?.trim());

export function productQuality(p: QualityInput): { score: number; missing: Missing[] } {
  const missing: Missing[] = [];
  const lose = (key: QualityKey, got: number, text: string) => {
    const max = CHECKS.find((c) => c.key === key)!.max;
    if (got < max) missing.push({ key, lost: max - got, text });
  };

  lose("photos", p.gallery >= 3 ? 15 : p.gallery === 2 ? 10 : p.gallery === 1 ? 5 : 0, p.gallery === 0 ? "Aucune photo" : `${p.gallery} photo${p.gallery > 1 ? "s" : ""} seulement (3 ou plus conseillées)`);
  lose("details", p.details >= 2 ? 15 : p.details === 1 ? 10 : 0, p.details === 0 ? "Pas de grandes images de description" : "1 seule grande image de description");
  const len = p.description.trim().length;
  lose("description", len >= 200 ? 10 : len >= 60 ? 6 : 0, len === 0 ? "Pas de description" : "Description courte (200 caractères ou plus conseillés)");
  // Arabic, the shop's main language: the name, and each text that exists in French.
  const ar = (filled(p.nameAr) ? 4 : 0) + (!filled(p.description) || filled(p.descriptionAr) ? 4 : 0) + (!filled(p.summary) || filled(p.summaryAr) ? 2 : 0);
  lose("arabic", ar, [!filled(p.nameAr) && "nom", filled(p.description) && !filled(p.descriptionAr) && "description", filled(p.summary) && !filled(p.summaryAr) && "phrase"].filter(Boolean).join(", ").replace(/^/, "Arabe manquant : "));
  lose("checked", p.checkedAt ? 10 : 0, "Fiche pas encore vérifiée avec le fournisseur");
  lose("summary", filled(p.summary) ? 5 : 0, "Pas de phrase sous le nom");
  lose("specs", filled(p.specs) ? 5 : 0, "Pas de caractéristiques");
  lose("category", p.categoryId ? 5 : 0, "Sans catégorie");
  lose("google", filled(p.seoTitle) && filled(p.seoDescription) ? 5 : filled(p.seoTitle) || filled(p.seoDescription) ? 3 : 0, "Titre ou description Google à écrire");
  lose("keywords", filled(p.keywords) ? 5 : 0, "Pas de mots-clés de recherche");
  lose("cost", p.cost != null ? 5 : 0, "Coût fournisseur inconnu (marge non calculée)");
  lose("video", filled(p.videoUrl) ? 5 : 0, "Pas de vidéo");
  const bad = p.offers.filter((o) => o.active && offerLabelProblem(o));
  lose("offers", bad.length ? 0 : 5, `${bad.length} offre${bad.length > 1 ? "s" : ""} dont le nom contredit la quantité`);

  const score = 100 - missing.reduce((s, m) => s + m.lost, 0);
  return { score, missing: missing.sort((a, b) => b.lost - a.lost) };
}

/** The colour of a score: good from 80, to improve from 50, weak below. */
export const scoreTone = (score: number) => (score >= 80 ? "ok" : score >= 50 ? "warn" : "danger") as "ok" | "warn" | "danger";
