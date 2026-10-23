import { z } from "zod";
import { SHOP_VOICE } from "./translate-prompt";

/**
 * The tall pictures under a product's description, planned the way the best
 * Amazon pages do theirs (A+ content): each one shows one real point of the
 * product in a known layout (the main benefit, callouts on its parts, before
 * and after, in use, its size, what is in the box, with and without it).
 * The AI plans them from the product's own texts; the requests below are
 * pasted, with the product's photo, into an image generator (Gemini,
 * ChatGPT). Nothing here makes a picture by itself.
 */

export const KINDS = ["hero", "features", "before_after", "in_use", "size", "in_box", "comparison"] as const;
export type Kind = (typeof KINDS)[number];

/** How the owner reads each kind. */
export const KIND_LABEL: Record<Kind, string> = {
  hero: "L'avantage principal",
  features: "Les points forts, fléchés",
  before_after: "Avant / après",
  in_use: "En utilisation",
  size: "Les dimensions",
  in_box: "Le contenu de la boîte",
  comparison: "Avec / sans",
};

const point = z.object({ ar: z.string(), fr: z.string() });
export const Idea = z.object({
  // An unknown kind from a chat assistant reads as the main benefit.
  kind: z.enum(KINDS).catch("hero"),
  headlineAr: z.string(),
  headlineFr: z.string(),
  points: z.array(point).default([]),
  scene: z.string(),
  sceneBefore: z.string().default(""),
});
export type ImageIdea = z.infer<typeof Idea>;

const str = { type: "string" } as const;
export const IDEA_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: [...KINDS] },
    headlineAr: str,
    headlineFr: str,
    points: { type: "array", items: { type: "object", properties: { ar: str, fr: str }, required: ["ar", "fr"], additionalProperties: false } },
    scene: str,
    sceneBefore: str,
  },
  required: ["kind", "headlineAr", "headlineFr", "points", "scene", "sceneBefore"],
  additionalProperties: false,
};

export const IDEAS_RULE = `"imageIdeas": 3 to 5 tall pictures to show under the description, planned like the best Amazon A+ content: each about one real feature or benefit the texts give, each of a different kind, the most convincing first (usually "hero"). Kinds:
  "hero": the product large, its main benefit as the headline, up to 3 short benefits with icons;
  "features": the product with up to 3 callouts pointing at its real parts;
  "before_after": the same scene without and with the product; only for a visible everyday result the texts support (a tidy car instead of a messy one, smooth hair instead of frizzy hair, a clean surface); never for weight, body shape, skin or health;
  "in_use": a person using it at home, the product in focus;
  "size": the product with its real dimensions or next to a common object; only dimensions the texts give;
  "in_box": everything the box contains, laid flat; only what the texts list;
  "comparison": with it / without it, never another brand.
  Each with: "kind"; "headlineAr" (Tunisian Arabic, at most 6 words) and "headlineFr" (the same in French); "points": 0 to 3 short callouts (2 to 5 words each), each with "ar" and "fr"; "scene": in English, what the picture shows, with the product exactly as in its photo (for "before_after" and "comparison", the side with the product); "sceneBefore": in English, for "before_after" and "comparison" only, the side without the product ("" otherwise). Never a price, a discount, stars, reviews, a badge, a certification or a promise the texts do not make.`;

const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/** Ideas within what the page shows: short lines, at most 3 callouts, without empty ones. */
export function cleanIdeas(ideas: ImageIdea[]): ImageIdea[] {
  return ideas
    .map((i) => ({
      kind: i.kind,
      headlineAr: clean(i.headlineAr, 80),
      headlineFr: clean(i.headlineFr, 80),
      points: i.points.map((p) => ({ ar: clean(p.ar, 60), fr: clean(p.fr, 60) })).filter((p) => p.ar || p.fr).slice(0, 3),
      scene: clean(i.scene, 600),
      sceneBefore: clean(i.sceneBefore, 600),
    }))
    .filter((i) => i.scene && (i.headlineAr || i.headlineFr))
    .slice(0, 6);
}

type Lang = "ar" | "fr";
const say = (lang: Lang, ar: string, fr: string) => (lang === "ar" ? ar : fr);

/** A text to write on the picture, and where it goes. */
type Label = { where: string; text: string };

/** What a picture of this kind looks like, and the texts on it, for the image generator. */
function layout(idea: ImageIdea, lang: Lang): { how: string; labels: Label[] } {
  const pts = idea.points.map((p) => say(lang, p.ar, p.fr)).filter(Boolean);
  const before = idea.sceneBefore || "the same scene without the product, showing the everyday problem.";
  const each = (where: string) => pts.map((text, i) => ({ where: `${where} ${i + 1}`, text }));
  switch (idea.kind) {
    case "hero":
      return { how: `The product large in the middle (about 60% of the height), in a simple setting that suits its use: ${idea.scene}${pts.length ? ` At the bottom, a row of ${pts.length} small line icons, each with its short text.` : ""}`, labels: each("Icon text") };
    case "features":
      return { how: `The product in the middle on a light plain background: ${idea.scene}${pts.length ? ` ${pts.length} callouts, each a thin line from a real part of the product to a small rounded label with a simple icon and its text.` : ""}`, labels: each("Callout") };
    case "before_after":
      return {
        how: `The picture split into two halves, top and bottom, with a thin white line between them. Top half, with a small tag: ${before} Bottom half, with a small tag: ${idea.scene} Same place, same light and same framing in both halves; a realistic result, not exaggerated.${pts.length ? " Under the bottom half, short labels." : ""}`,
        labels: [{ where: "Tag on the top half", text: say(lang, "قبل", "Avant") }, { where: "Tag on the bottom half", text: say(lang, "بعد", "Après") }, ...each("Label")],
      };
    case "in_use":
      return { how: `A real-life photo: ${idea.scene} A bright, simple Mediterranean home; the person natural and modestly dressed, their hands and the product in sharp focus.${pts.length ? " At the bottom, short labels." : ""}`, labels: each("Label") };
    case "size":
      return { how: `The product on a light plain background: ${idea.scene}${pts.length ? " Thin measurement lines with small arrows, each with one of the dimensions below next to it, and no other dimension." : ""}`, labels: each("Dimension") };
    case "in_box":
      return { how: `A flat lay seen from above on a light background, every item of the box apart and neatly aligned: ${idea.scene}${pts.length ? " A small label under the items." : ""}`, labels: each("Label") };
    case "comparison":
      return {
        how: `Two columns side by side, each with its title. Left column: ${before} Right column: ${idea.scene}${pts.length ? " Under the right column, short lines with a tick." : ""} No other brand or product name.`,
        labels: [{ where: "Title of the left column", text: say(lang, "من غيرو", "Sans") }, { where: "Title of the right column", text: say(lang, "بيه", "Avec") }, ...each("Ticked line")],
      };
  }
}

const headlineOf = (idea: ImageIdea, lang: Lang) => say(lang, idea.headlineAr, idea.headlineFr) || say(lang, idea.headlineFr, idea.headlineAr);

/** The texts of the picture, one per line: easy to check, and never mixed with the instructions. */
function texts(labels: Label[], lang: Lang): string {
  return `Texts to write on the picture, exactly as given${lang === "ar" ? ", in Arabic letters from right to left and correctly joined" : ""}:
${labels.map((l) => `- ${l.where}:
  «${l.text}»`).join("\n")}`;
}

/** The rules every picture follows, whatever its kind. */
const RULES = `Product: use the product from the attached photo exactly as it is: same shape, colours, parts, proportions and material. Do not add, remove or change any part, button, logo or accessory.
Style: bright, clean and premium, like the best Amazon product pages; soft natural light; one accent colour taken from the product; plenty of empty space; the product always sharp.
Text: only the texts listed, spelled exactly; a clean bold sans-serif font; large enough to read on a phone (the headline about 7% of the picture's height); dark text on a light area, or white text on a dark area, never over busy parts of the photo.
Never add: a price, a discount, stars, reviews, a badge such as "best seller" or "N°1", a certification, a logo, a watermark, a QR code, a web address or any other text.`;

/** One tall picture for one idea. */
export function imagePrompt(idea: ImageIdea, lang: Lang): string {
  const { how, labels } = layout(idea, lang);
  return `Create one tall product picture for an online shop: portrait 2:3, 1200 × 1800 px.
Layout: the headline at the top. ${how}
${texts([{ where: "Headline", text: headlineOf(idea, lang) }, ...labels], lang)}
${RULES}`;
}

/**
 * All the ideas in one very tall picture, the way the long pictures of
 * Amazon pages tell the product from top to bottom: one band per idea.
 */
export function longImagePrompt(ideas: ImageIdea[], lang: Lang): string {
  const parts = ideas.map((idea, i) => ({ n: i + 1, idea, ...layout(idea, lang) }));
  return `Create one very tall product picture for an online shop, portrait 9:16 (1080 × 1920 px), made of ${ideas.length} bands of the same height stacked from top to bottom and separated by a little white space, telling the product's story like the long pictures of the best Amazon pages. Every band has its headline at its top, and the same colours, font and style.
${parts.map((p) => `Band ${p.n}: ${p.how}`).join("\n")}
${texts(parts.flatMap((p) => [{ where: `Band ${p.n}, headline`, text: headlineOf(p.idea, lang) }, ...p.labels.map((l) => ({ where: `Band ${p.n}, ${l.where.toLowerCase()}`, text: l.text }))]), lang)}
${RULES}`;
}

/* ------------------------------------------------------------------ */
/* Ideas for a product already in the shop                             */
/* ------------------------------------------------------------------ */

export type IdeaTexts = { name: string; summary: string; description: string; specs: string; nameAr: string; descriptionAr: string };

export const IDEAS_SYSTEM = `${SHOP_VOICE}

You plan the tall pictures shown under a product's description, from the product's texts below. Use only what the texts say about the product: never a feature, a number, a size, a result or a promise they do not contain.

${IDEAS_RULE}`;

export const ideasTask = (t: IdeaTexts) => `The product's texts (JSON):\n${JSON.stringify(t, null, 1)}`;

/** The whole request as one text to paste into a chat assistant. */
export function manualIdeasRequest(t: IdeaTexts): string {
  return `${IDEAS_SYSTEM}

Answer with one JSON object only, nothing before or after it:
${JSON.stringify({ imageIdeas: [{ kind: "hero", headlineAr: "", headlineFr: "", points: [{ ar: "", fr: "" }], scene: "", sceneBefore: "" }] })}

${ideasTask(t)}`;
}

export const IDEAS_ANSWER_SCHEMA = { type: "object", properties: { imageIdeas: { type: "array", items: IDEA_SCHEMA } }, required: ["imageIdeas"], additionalProperties: false };
const Answer = z.object({ imageIdeas: z.array(Idea) });

/** The reply pasted back: its ideas (code fences and text around them are ignored), or null. */
export function readIdeasAnswer(reply: string): ImageIdea[] | null {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  if (from < 0 || to <= from) return null;
  try {
    const parsed = Answer.safeParse(JSON.parse(reply.slice(from, to + 1)));
    const ideas = parsed.success ? cleanIdeas(parsed.data.imageIdeas) : [];
    return ideas.length ? ideas : null;
  } catch {
    return null;
  }
}
