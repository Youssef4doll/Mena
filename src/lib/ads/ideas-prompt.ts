import { z } from "zod";
import { formatTND } from "../money";
import { buildBrief, copyWarnings, specLines, type Brief, type BriefInput } from "./brief";
import { cleanName, shortSlug, suggestAdName } from "./utm";

/**
 * The request for new ad concepts, shared by the generation on the server
 * (with an API key, ideas.ts) and the manual one (no key: the owner copies
 * it into claude.ai and pastes the reply back). One text holds the rules of
 * a cash-on-delivery media buyer, the product's facts and real numbers, and
 * the exact output format; the reply is read back with the same schema
 * either way, and every concept is checked against the product's facts.
 *
 *   ideasRequest(input, count)        → string           the whole request, to paste into claude.ai
 *   IDEAS_SYSTEM, ideasTask(input, n) → string           the same, split for the API (system + user message)
 *   IDEAS_SCHEMA                      → JSON schema      structured output of the API
 *   readIdeasReply(reply, input, n)   → IdeaConcept[] | null   the pasted reply, checked and named
 *   normalizeConcepts(list, input, n) → IdeaConcept[]    ad names cleaned and unique
 *   conceptWarnings(concept, input)   → string[]         what in a concept breaks the rules
 */

export const IDEA_ANGLES = ["demo", "problem", "beforeAfter", "testimonial", "offer", "unboxing", "gift", "other"] as const;
export const IDEA_FORMATS = ["video", "carousel", "static"] as const;
export const MIN_IDEAS = 1;
export const MAX_IDEAS = 8;
export const DEFAULT_IDEAS = 4;

/** A count of concepts from anything (a form field): an integer from 1 to 8, 4 when unreadable. */
export function ideaCount(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return DEFAULT_IDEAS;
  return Math.min(MAX_IDEAS, Math.max(MIN_IDEAS, Math.round(v)));
}

const text = z.string().trim().max(4000);
const Beat = z.object({ time: text, shot: text, onScreenAr: text, onScreenFr: text, voiceAr: text });
export const Concept = z.object({
  title: text,
  angle: z.enum(IDEA_ANGLES).catch("other"),
  format: z.enum(IDEA_FORMATS).catch("video"),
  hookVisual: text,
  hookTextAr: text,
  hookTextFr: text,
  beats: z.array(Beat).max(12),
  primaryTextAr: text,
  primaryTextFr: text,
  headlineAr: text,
  headlineFr: text,
  cta: text,
  why: text,
  measure: text,
  adName: text,
});
export type IdeaConcept = z.output<typeof Concept>;
export type IdeaBeat = z.output<typeof Beat>;
export const IdeasAnswer = z.object({ concepts: z.array(Concept).min(1).max(MAX_IDEAS * 2) });

const str = { type: "string" } as const;
const BEAT_SCHEMA = {
  type: "object",
  properties: { time: str, shot: str, onScreenAr: str, onScreenFr: str, voiceAr: str },
  required: ["time", "shot", "onScreenAr", "onScreenFr", "voiceAr"],
  additionalProperties: false,
};
const CONCEPT_FIELDS = ["title", "angle", "format", "hookVisual", "hookTextAr", "hookTextFr", "beats", "primaryTextAr", "primaryTextFr", "headlineAr", "headlineFr", "cta", "why", "measure", "adName"] as const;
export const IDEAS_SCHEMA = {
  type: "object",
  properties: {
    concepts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: str,
          angle: { type: "string", enum: [...IDEA_ANGLES] },
          format: { type: "string", enum: [...IDEA_FORMATS] },
          hookVisual: str,
          hookTextAr: str,
          hookTextFr: str,
          beats: { type: "array", items: BEAT_SCHEMA },
          primaryTextAr: str,
          primaryTextFr: str,
          headlineAr: str,
          headlineFr: str,
          cta: str,
          why: str,
          measure: str,
          adName: str,
        },
        required: [...CONCEPT_FIELDS],
        additionalProperties: false,
      },
    },
  },
  required: ["concepts"],
  additionalProperties: false,
};

export const IDEAS_SYSTEM = `You are a senior performance creative strategist and media buyer who has run very large cash-on-delivery budgets on Meta (Facebook, Instagram) and TikTok, in Tunisia and North Africa. You write ad concepts for Mena, an online shop in Tunisia. Customers order on the product page without paying; the shop calls them to confirm; the carrier collects the cash at the door; a refused parcel costs the shop the carrier both ways and brings nothing. So the only ad that wins brings orders that are confirmed AND delivered. An ad that over-promises gets cheap clicks, then unconfirmed orders and refusals.

What works for cash on delivery in Tunisia, and you apply it:
- The product on screen in the first second. The first 3 seconds decide whether people watch: no logo intro, no slow build-up.
- Filmed on a phone, natural light, real hands, a real home: it looks like a post in the feed, not a TV spot.
- The real product exactly as shipped: real size (in hand), real colour, what is in the parcel. A mismatch between the ad and the parcel is the first cause of refusals.
- The price and the delivery fee said in the ad: people without intent do not order, confirmation goes up.
- Cash on delivery said clearly. "Open the parcel before paying" only when the facts say so.
- One idea per ad. Subtitles burned in (most people watch muted). Text away from the bottom fifth and the right edge (the platform's buttons).
- Voice-over and on-screen text in Tunisian derja reach the most people; the French versions are for the French-speaking audience.

Rules you never break:
- Use only the facts given. Never invent a feature, number, material, size, result, guarantee, award, number of customers or sales, discount, deadline or stock level. A fact that is not in the data is not said.
- No fake scarcity or urgency: no "stock limité", "dernières pièces", countdowns. The only date allowed is an offer's real end date given in the facts.
- No fake reviews and no actor presented as a customer. A review is quoted word for word from the facts, with its signature.
- No health, medical, weight-loss or beauty-result claims. Before/after only on objects or places, never on bodies, skin or weight.
- Do not address personal attributes ("Tu as mal au dos ?"): speak about the product, not the viewer's body, health, money or identity (Meta refuses these ads).
- Prices, delivery fee, delivery delay and payment terms exactly as given, written the same way (59,900 DT in French, 59,900 د.ت in Arabic).
- No exclamation marks, no emojis.

Language:
- Arabic fields are in Tunisian Arabic (derja), in Arabic letters, with everyday words an older Tunisian understands at once (توّا، برشا، متاع، كي، باش، يوصلك، الخلاص عند الاستلام، نعيطولك). Not Modern Standard Arabic, and not Egyptian, Gulf, Moroccan or Algerian dialect. Product names may keep the French or English word Tunisians use.
- French fields are plain, correct French.`;

const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : null);

/** The product's facts and real numbers, as the request shows them: only what an ad may use, and what the data says. */
export function ideasFacts(input: BriefInput, brief: Brief = buildBrief(input)) {
  const { product: p, shop: s, reviews, performance: f, baseline: b } = input;
  const now = Date.parse(input.asOf);
  const offers = p.offers.filter((o) => !o.endsAt || Date.parse(o.endsAt) > now);
  const fact = (label: string) => brief.facts.find((x) => x.label === label);
  const unit = brief.ceilings.rows[0];
  return {
    product: {
      name: p.name,
      nameAr: p.nameAr,
      category: p.category,
      summary: p.summary || null,
      summaryAr: p.summaryAr,
      specs: specLines(p.specs).map((l) => `${l.label}: ${l.value}`),
      specsAr: specLines(p.specsAr).map((l) => `${l.label}: ${l.value}`),
      choices: p.variants.map((v) => (v.nameAr ? `${v.name} / ${v.nameAr}` : v.name)),
      price: formatTND(p.price),
      previousPrice: p.compareAt != null && p.compareAt > p.price ? formatTND(p.compareAt) : null,
      offers: offers.map((o) => ({
        label: o.label,
        labelAr: o.labelAr,
        units: o.quantity,
        price: formatTND(o.price),
        pricePerUnit: formatTND(Math.round(o.price / o.quantity)),
        freeDelivery: o.freeDelivery,
        endsOn: o.endsAt ? o.endsAt.slice(0, 10) : null,
      })),
      pageHasVideo: p.hasVideo,
      pagePhotos: p.photos,
    },
    shop: {
      delivery: fact("Livraison"),
      freeDeliveryFrom: s.freeThreshold != null && s.deliveryFee > 0 ? formatTND(s.freeThreshold) : null,
      payment: fact("Paiement"),
      openBeforePaying: s.openBeforePaying,
      confirmationCall: "The shop calls every customer to confirm before shipping.",
      returns: fact("Retours"),
    },
    reviews: {
      published: reviews.count,
      average: reviews.average != null ? Math.round(reviews.average * 10) / 10 : null,
      quotes: reviews.quotes.filter((q) => q.text?.trim()).map((q) => ({ text: q.text, signature: `${q.authorName}${q.governorate ? `, ${q.governorate}` : ""}`, rating: q.rating })),
    },
    customersSearched: f.searches.map((x) => ({ words: x.q, times: x.count })),
    results: {
      days: f.days,
      productPageVisits: f.visits,
      orderFormsStarted: f.formStarts,
      formStartRate: rate(f.formStarts, f.visits),
      shopFormStartRate: rate(f.shopFormStarts, f.shopVisits),
      orders: f.orders,
      confirmationRate: rate(f.confirmed, f.decided),
      shopConfirmationRate: b.confirmRate != null ? Math.round(b.confirmRate * 1000) / 1000 : null,
      delivered: f.delivered,
      refusedOrReturned: f.back,
      deliveryRate: rate(f.delivered, f.delivered + f.back),
      shopDeliveryRate: b.deliveryRate != null ? Math.round(b.deliveryRate * 1000) / 1000 : null,
      stillOpen: f.open,
      ordersWithSeveralUnits: f.multiUnitOrders,
      refusalReasons: f.refusals,
      shopRefusalReasons: f.shopRefusals,
      ads: f.ads.map((a) => ({ ad: a.ad, campaign: a.campaign, source: a.source, productPageVisits: a.visits, orders: a.orders, confirmed: a.confirmed, delivered: a.delivered, refusedOrReturned: a.back })),
    },
    focus: brief.focus.map((x) => ({ title: x.title, evidence: x.evidence, action: x.action })),
    ceilings:
      unit && unit.maxCostPerDelivered != null && unit.maxCpa != null
        ? { note: "Estimate from the product's margin and its confirmation and delivery rates.", maxAdCostPerDeliveredOrder: formatTND(unit.maxCostPerDelivered), maxAdCostPerPlacedOrder: formatTND(unit.maxCpa) }
        : null,
    briefAngles: brief.angles.map((a) => a.key),
  };
}

/** The user message: what to write, how, the exact fields, then the facts. */
export function ideasTask(input: BriefInput, count: number, brief: Brief = buildBrief(input)): string {
  const n = ideaCount(count);
  const prefix = shortSlug(input.product.slug);
  return `Write ${n} ad concept${n > 1 ? "s" : ""} for the product below, for Meta (Facebook, Instagram) and TikTok.

How to choose them:
- Read "focus" first: it is what this product's real numbers say the ads must fix. The first concept answers the most important focus.
- Make the concepts different from each other (another angle or another hook), so they can be tested against each other with the same budget in the same ad set. One idea per concept.
- "briefAngles" are the angles the shop's brief already proposes, best first. You may use them, with new hooks and scripts, or bring a better angle.
- If "results.ads" shows an ad with good results, it is the control: say in "why" what your concept changes compared with it.
- A testimonial concept only quotes "reviews.quotes" word for word. With no quote, no testimonial concept.
- The hook text is at most 8 words. The product is on screen in the first second.
- A video is 15 to 30 seconds, 9:16, filmed on a phone, in 4 to 6 beats with times ("0-3 s", "3-8 s"…). The last beat shows the price, the delivery and cash on delivery, and the call to action. A carousel has one beat per card ("Carte 1"…), a static image one beat ("Image").

Fields, all required:
- title: French, 2 to 6 words.
- angle: one of ${IDEA_ANGLES.join(", ")}.
- format: video, carousel or static.
- hookVisual: French, what is seen in the first 3 seconds.
- hookTextAr, hookTextFr: the on-screen text of the first 3 seconds, in derja and in French.
- beats: list of { time, shot (French: what is filmed), onScreenAr, onScreenFr (short on-screen text, may be empty), voiceAr (voice-over in derja, may be empty) }.
- primaryTextAr, primaryTextFr: the text above the ad, 2 to 5 short lines; the first line under 125 characters (most people read only that); it ends with how to order and cash on delivery.
- headlineAr, headlineFr: under 40 characters.
- cta: the button, "Commander" or "Acheter".
- why: French, 1 or 2 sentences: why it should work for this product, tied to its facts or numbers.
- measure: French, 1 or 2 sentences: the numbers that decide whether to keep it (hook rate = 3-second views ÷ impressions and link CTR in Ads Manager; orders per visit, confirmation rate, delivery rate and cost per delivered order in the shop), with the ceiling from "ceilings" when there is one.
- adName: the ad's name in Ads Manager and in its link: lowercase, dashes, no spaces, starting with "${prefix}-" (for example "${prefix}-demo-v1").

Product facts and numbers (JSON):
${JSON.stringify(ideasFacts(input, brief), null, 1)}`;
}

/** An empty concept, to show the exact shape expected in a pasted reply. */
const SHAPE = {
  concepts: [
    {
      title: "",
      angle: "demo",
      format: "video",
      hookVisual: "",
      hookTextAr: "",
      hookTextFr: "",
      beats: [{ time: "0-3 s", shot: "", onScreenAr: "", onScreenFr: "", voiceAr: "" }],
      primaryTextAr: "",
      primaryTextFr: "",
      headlineAr: "",
      headlineFr: "",
      cta: "Commander",
      why: "",
      measure: "",
      adName: "",
    },
  ],
};

/** The whole request as one text to paste into claude.ai. */
export function ideasRequest(input: BriefInput, count: number): string {
  return `${IDEAS_SYSTEM}

${ideasTask(input, count)}

Answer with the JSON object only, in exactly this shape (one object per concept in "concepts"), and nothing before or after it:
${JSON.stringify(SHAPE)}`;
}

/**
 * Ad names cleaned (lowercase, dashes), given one when empty, and made
 * unique, so each concept can be launched under its own utm_content. At
 * most `count` concepts.
 */
export function normalizeConcepts(list: IdeaConcept[], input: BriefInput, count: number = MAX_IDEAS): IdeaConcept[] {
  const used = new Set<string>();
  return list.slice(0, ideaCount(count)).map((c, i) => {
    let name = cleanName(c.adName).slice(0, 60) || suggestAdName(input.product.slug, c.angle, i + 1);
    for (let k = 2; used.has(name); k++) name = `${cleanName(c.adName).slice(0, 56) || suggestAdName(input.product.slug, c.angle, i + 1)}-${k}`;
    used.add(name);
    return { ...c, adName: name };
  });
}

/** The pasted reply: the concepts found in it (code fences and text around are ignored), or null when unreadable. */
export function readIdeasReply(reply: string, input: BriefInput, count: number = MAX_IDEAS): IdeaConcept[] | null {
  if (reply.length > 400_000) return null;
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  let data: unknown = null;
  try {
    if (from >= 0 && to > from) data = JSON.parse(reply.slice(from, to + 1));
  } catch {
    // A reply made of a bare array of concepts is read below.
  }
  if (data == null || (typeof data === "object" && !Array.isArray(data) && !("concepts" in (data as object)))) {
    const a = reply.indexOf("[");
    const b = reply.lastIndexOf("]");
    try {
      if (a >= 0 && b > a) data = { concepts: JSON.parse(reply.slice(a, b + 1)) };
    } catch {
      return null;
    }
  }
  const parsed = IdeasAnswer.safeParse(data);
  return parsed.success ? normalizeConcepts(parsed.data.concepts, input, count) : null;
}

/** Every text of a concept, checked against the product's facts and the shop's settings (see copyWarnings). */
export function conceptWarnings(c: IdeaConcept, input: BriefInput): string[] {
  const all = [c.hookTextAr, c.hookTextFr, c.primaryTextAr, c.primaryTextFr, c.headlineAr, c.headlineFr, ...c.beats.flatMap((b) => [b.onScreenAr, b.onScreenFr, b.voiceAr])].join("\n");
  return copyWarnings(all, input);
}
