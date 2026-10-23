import { z } from "zod";
import { SHOP_VOICE } from "./translate-prompt";

/**
 * Category names in Tunisian Arabic. The common aisles have their name here
 * (free, at once, also when a CSV or Ecomness import creates the category);
 * the others go to the AI with the key, or to claude.ai without it.
 */
const AR: Record<string, string> = {
  maison: "الدار", cuisine: "الكوجينة", beaute: "التجميل", accessoires: "الإكسسوارات", "high-tech": "التكنولوجيا", hightech: "التكنولوجيا",
  meubles: "الموبيليا", decoration: "الديكور", sport: "الرياضة", fitness: "الرياضة", electronique: "الإلكترونيك", auto: "الكرهبة", voiture: "الكرهبة",
  sante: "الصحة", bebe: "البيبي", enfants: "الصغار", jouets: "اللعب", mode: "الموضة", vetements: "الحوايج", chaussures: "الصبابط", sacs: "الصاكوات",
  bijoux: "المجوهرات", montres: "المنقالات", telephonie: "التليفونات", telephones: "التليفونات", informatique: "الإعلامية", "jeux video": "ألعاب الفيديو",
  bricolage: "البريكولاج", outils: "العدّة", jardin: "الجنينة", animaux: "الحيوانات", bureau: "المكتب", eclairage: "الضو", "salle de bain": "بيت البانو",
  chambre: "بيت النوم", "plein air": "الخرجات", voyage: "السفر", menage: "التنظيف", nettoyage: "التنظيف", electromenager: "الكهرومنزلي", cheveux: "الشعر",
  maquillage: "الماكياج", soins: "العناية", parfums: "العطورات", homme: "الرجال", femme: "النساء", gadgets: "الأدوات", "linge de maison": "الفرش",
  rangement: "الترتيب", hygiene: "النظافة", "bien-etre": "الراحة", camping: "التخييم", cadeaux: "الهدايا", "cuisine et maison": "الكوجينة والدار",
};

const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, " ").replace(/\s+/g, " ").trim();

/** The Tunisian Arabic name of a common category, or "" when it is not one. */
export const arabicCategory = (name: string) => AR[key(name)] ?? "";

/** A category whose Arabic is missing: its name, or its home page title, in French only. */
export type CategoryText = { id: string; name: string; nameAr: string; headline: string; headlineAr: string };
export const lacksArabic = (c: CategoryText) => (!c.nameAr.trim() && Boolean(c.name.trim())) || (!c.headlineAr.trim() && Boolean(c.headline.trim()));

/** What a translation gives back for one category. */
export type CategoryArabic = { id: string; nameAr: string; headlineAr: string };

export const CATEGORIES_SYSTEM = `${SHOP_VOICE}

Translate the names of the shop's categories (its aisles) and the titles of their cards on the home page into Tunisian Arabic. A name is one to three words, the words a Tunisian shop uses for that aisle (for example Maison → الدار, Cuisine → الكوجينة, Meubles → الموبيليا, Vêtements → الحوايج). A title is a short phrase, translated faithfully. No exclamation marks, no emojis. "headlineAr" is "" when the category has no title.`;

export const categoriesTask = (items: CategoryText[]) =>
  `The categories (JSON):\n${JSON.stringify(items.map((c) => ({ id: c.id, name: c.name, headline: c.headline })), null, 1)}`;

export const CATEGORIES_SCHEMA = {
  type: "object",
  properties: {
    categories: {
      type: "array",
      items: { type: "object", properties: { id: { type: "string" }, nameAr: { type: "string" }, headlineAr: { type: "string" } }, required: ["id", "nameAr", "headlineAr"], additionalProperties: false },
    },
  },
  required: ["categories"],
  additionalProperties: false,
};

const Answer = z.object({ categories: z.array(z.object({ id: z.string(), nameAr: z.string(), headlineAr: z.string().default("") })) });

/** The request as one text to paste into a chat assistant. */
export function manualCategoriesRequest(items: CategoryText[]): string {
  return `${CATEGORIES_SYSTEM}

Answer with one JSON object only, nothing before or after it, with each category's "id" unchanged:
${JSON.stringify({ categories: [{ id: "", nameAr: "", headlineAr: "" }] })}

${categoriesTask(items)}`;
}

const line = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/** The categories of an answer (from the API or pasted back), names on one line and within the field's length. */
export function readCategoriesAnswer(reply: string): CategoryArabic[] | null {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  if (from < 0 || to <= from) return null;
  try {
    const parsed = Answer.safeParse(JSON.parse(reply.slice(from, to + 1)));
    if (!parsed.success) return null;
    const out = parsed.data.categories.map((c) => ({ id: c.id, nameAr: line(c.nameAr, 60), headlineAr: line(c.headlineAr, 60) })).filter((c) => c.nameAr || c.headlineAr);
    return out.length ? out : null;
  } catch {
    return null;
  }
}
