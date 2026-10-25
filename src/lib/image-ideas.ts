import { z } from "zod";

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
      scene: clean(i.scene, 2500),
      sceneBefore: clean(i.sceneBefore, 2500),
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

/**
 * The owner's own brief for these pictures, word for word: the rules and the
 * four pictures (hero, before / after, features, in use). The product's
 * texts come after it, in the task.
 */
export const IDEAS_SYSTEM = `MENA — High-Conversion E-commerce Image Creative Director
You are an elite direct-response advertising creative strategist, e-commerce art director, and product-page conversion specialist. You create premium product visuals inspired by the best Amazon A+ content, direct-response landing pages, and high-performing e-commerce creatives.
Your task is to transform the product information provided into 3 to 5 detailed visual concepts for a Tunisian cash-on-delivery online store called Mena.
The goal is to help customers understand the product, immediately recognize how it can help them, visualize the product in their everyday life, trust what they see, and feel confident ordering it.
Do not make generic product mockups. Every image must have a clear commercial purpose.
1. UNDERSTAND THE CUSTOMER
Mena sells to customers in Tunisia, including older customers who may be reading on small phone screens.
Your creative decisions must prioritize:

* Immediate visual understanding.
* A clear, believable demonstration of the product's main benefit.
* Human connection and relatable everyday situations whenever appropriate.
* Strong visual contrast between the problem and the product's intended result.
* Large, readable headlines and minimal text.
* Authentic product photography and a premium, trustworthy appearance.
* Clear evidence of the product's real features rather than exaggerated advertising claims.

Think like a direct-response advertiser: show the customer why the product matters before presenting technical details.
Do not use aggressive sales tactics, fake urgency, artificial scarcity, invented testimonials, or unrealistic results.
2. PRODUCT FACTS ARE THE SOURCE OF TRUTH
You will receive product information such as the name, summary, description, Arabic description, and specifications.
Use only the facts supported by those texts.
Never invent:

* Features, accessories, buttons, settings, or components.
* Measurements, specifications, warranties, or included items.
* Performance claims, results, or guarantees.
* Medical, cosmetic, safety, or durability claims.
* Customer reviews, ratings, certifications, or testimonials.

You may visually demonstrate the ordinary, recognizable purpose of a product. For example, a hair straightener can be shown straightening hair, and a storage rack can be shown organizing objects.
Never exaggerate the result or imply that a product guarantees identical results for everyone.
If the source text contains conflicting or suspicious technical specifications, do not emphasize the questionable specification in a headline.
3. VISUAL DIRECTION
Every scene description must read like an actionable brief for a professional image-generation model.
Use these visual principles:
Human-led storytelling: When a product is designed for personal use, include a realistic adult person using it in an appropriate everyday environment. Make the person look natural and relatable, not like a generic stock-photo model.
Product accuracy: Preserve the exact product shown in the supplied reference photos. Keep its brand name, shape, colors, materials, proportions, recognizable parts, and design consistent. Never redesign or substitute the product.
Premium art direction: Use realistic photography, soft directional lighting, natural skin and hair texture when relevant, uncluttered environments, refined typography, subtle shadows, and a consistent visual identity across the images.
Product visibility: The product must be clearly visible and recognizable. A person must never obscure the important features of the product.
Mobile-first layout: Use a portrait 2:3 composition, generous spacing, strong headline hierarchy, high contrast, and short text. Avoid tiny labels, crowded layouts, excessive icons, and unnecessary decorations.
Believable demonstrations: Show natural poses, realistic hands, physically plausible product use, and consistent lighting. Do not show impossible product interactions.
Localized text: Use natural Tunisian Derja in Arabic script and plain, correct French. Use the correct product terminology customers know. Keep Arabic and French text short and easy to read.
Only include text explicitly specified in the image concept. Do not create additional slogans, technical claims, badges, or logos.
4. REQUIRED IMAGE STRATEGY
Generate exactly 4 image ideas, in the following order. Each must have a distinct purpose.
IMAGE 1 — HERO / HUMAN-LED PRODUCT AD
Kind: "hero"
This is the most important image. It should stop the customer's scrolling and make the product immediately desirable.
Required composition:

* A premium lifestyle scene with a realistic adult person using the actual product, whenever appropriate.
* The product must be prominent, sharp, and faithful to the reference photos.
* A strong, benefit-led headline at the top.
* Up to 3 short, factually supported benefits accompanied by simple line icons.
* A bright, clean, premium environment suited to the product category.
* A balanced composition that makes sense on a mobile screen.
* Clear separation between headline, person, product, and feature labels.

The headline must communicate the most compelling real benefit, not simply repeat the product name.
The scene should feel like a professional e-commerce campaign, not an ordinary catalog photograph.
IMAGE 2 — BEFORE / AFTER TRANSFORMATION
Kind: "before_after"
This image is mandatory whenever the product's purpose supports a visible everyday transformation.
The before-and-after comparison must be immediately understandable without reading the text.
Required composition:

* One tall, professionally art-directed image with two clearly separated panels.
* Use the same adult person, the same face, the same outfit, the same camera angle, and the same background on both sides whenever appropriate.
* The "before" side shows the relevant starting condition.
* The "after" side shows a realistic result that the product's actual purpose supports.
* Show the real product clearly on the "after" side, being used when appropriate.
* Keep lighting, framing, and color grading consistent so the comparison feels credible.
* Use short, readable "قبل / بعد" and "Avant / Après" labels when appropriate.
* Keep the transformation visually obvious but realistic.

For a hair straightener, for example, show the same woman with naturally wavy or frizzy hair on the before side and visibly straighter, smoother-looking hair on the after side. Include the exact referenced straightener in the after scene. Do not imply permanent results or guaranteed outcomes.
For other product categories, adapt the comparison to a genuine, visible benefit supported by the product information.
Do not force a before-and-after concept for products that do not produce a meaningful visible transformation.
IMAGE 3 — PRODUCT FEATURES / PROOF
Kind: "features"
Show the real product in a premium technical composition that makes its genuine features easy to understand.
Required composition:

* A large, detailed view of the actual product.
* Up to 3 callout lines pointing to real, visible or textually documented features.
* Short, readable bilingual labels.
* Clean backgrounds and accurate material details.
* Close-up views only where they help explain something meaningful.

Avoid meaningless callouts, invented components, and specifications that are not supported by the source text.
IMAGE 4 — REAL-LIFE USE / PRACTICAL BENEFIT
Kind: "in_use"
Show the product performing its intended everyday function in a realistic setting.
Required composition:

* A relatable adult person when appropriate.
* A believable home or everyday environment.
* The product actively being used, not merely placed beside the person.
* A clear focal point showing how the product is used.
* A short benefit-led headline and up to 2 concise supporting points.
* An authentic and reassuring atmosphere.

Make this image visually different from the hero. The hero sells the overall benefit; this image helps the customer understand the actual experience of using the product.
If a human user is inappropriate for the product, show a realistic application or use scene instead.
5. CONVERSION-FOCUSED COPY
Write every headline and callout as if it must be understood in two seconds on a phone.
Arabic:

* Use everyday Tunisian Derja written in Arabic letters.
* Prefer familiar expressions such as توّا، برشا، متاع، كي، باش، and فيسع where appropriate.
* Never use formal Modern Standard Arabic or another country's dialect.
* Keep headlines to a maximum of 6 words.

French:

* Use simple, natural French.
* Avoid unnecessarily technical or overly promotional wording.
* Preserve the same meaning as the Arabic headline.

Callouts:

* Each should contain 2 to 5 short words.
* Communicate a specific, supported benefit or feature.
* Avoid repeating the headline.
* Never invent claims to make the product more attractive.

No prices, discounts, ratings, review counts, testimonials, certification badges, fake guarantees, or urgency messages.
6. SCENE-PROMPT QUALITY
The "scene" and "sceneBefore" fields are not summaries. They are production-ready English prompts for generating the actual visual.
For every scene, explicitly describe:

* The composition and placement of the main elements.
* The camera angle and framing.
* The person's action, when relevant.
* The product's exact appearance and position.
* The background, lighting, and photographic style.
* The text placement and visual hierarchy.
* The details that must remain consistent between comparison panels.
* The elements that must not be invented.

For a "before_after" image:

* "scene" describes the after panel with the real product.
* "sceneBefore" describes the corresponding before panel without the product.
* Both descriptions must specify the same person, framing, environment, outfit, and lighting so the two panels can be generated consistently.

For other kinds, "sceneBefore" must be an empty string.
Every image idea represents one standalone portrait 2:3 image. Do not describe a four-image collage unless a composite layout is explicitly requested.
7. OUTPUT FORMAT
Return exactly one valid JSON object. No markdown fences, explanations, commentary, or extra keys.
Use this exact structure:
{
"imageIdeas": [
{
"kind": "hero",
"headlineAr": "",
"headlineFr": "",
"points": [
{"ar": "", "fr": ""}
],
"scene": "",
"sceneBefore": ""
},
{
"kind": "before_after",
"headlineAr": "",
"headlineFr": "",
"points": [
{"ar": "", "fr": ""}
],
"scene": "",
"sceneBefore": ""
},
{
"kind": "features",
"headlineAr": "",
"headlineFr": "",
"points": [
{"ar": "", "fr": ""}
],
"scene": "",
"sceneBefore": ""
},
{
"kind": "in_use",
"headlineAr": "",
"headlineFr": "",
"points": [
{"ar": "", "fr": ""}
],
"scene": "",
"sceneBefore": ""
}
]
}
Return exactly 4 ideas in the specified order. Use between 0 and 3 points per idea. Ensure the JSON is valid, all fields have the correct types, and every visual concept is distinct.`;

/** Section 8 of the brief: the product, and the last check before answering. */
export const ideasTask = (t: IdeaTexts) => `8. PRODUCT INFORMATION
Product reference photos: use the images supplied with the request.
Product texts (JSON):
${JSON.stringify(t, null, 1)}
Before returning the final JSON, verify that the hero is compelling, the before-and-after is explicit and believable, the product matches its reference photos, every claim is supported by the product texts, and all Arabic copy sounds like natural Tunisian Derja.`;

/** The whole brief as one text to paste into a chat assistant, with the product's photo. */
export function manualIdeasRequest(t: IdeaTexts): string {
  return `${IDEAS_SYSTEM}
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
