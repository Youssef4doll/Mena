import { z } from "zod";
import { GOVERNORATE_IDS, GRAND_TUNIS } from "./governorates";

/**
 * Everything the shop configures from the back office, with the defaults a
 * fresh install starts from. Pure (no database), so the checkout rules can be
 * tested against it.
 */

export const deliveryZoneSchema = z.object({
  /** Working days, as the carrier quotes them. Shown as a range, never a date. */
  minDays: z.number().int().min(0).max(30),
  maxDays: z.number().int().min(0).max(30),
  /** Whether the shop delivers there at all. */
  enabled: z.boolean(),
});
export type DeliveryZone = z.infer<typeof deliveryZoneSchema>;

export const settingsSchema = z.object({
  shop: z.object({
    name: z.string().min(1).max(60),
    tagline: z.string().max(140),
    taglineAr: z.string().max(140),
    phone: z.string().max(20),
    email: z.string().max(120),
    address: z.string().max(200),
    /** Who sells, as registered (company or person); empty → the shop's name. Footer, contact and legal pages. */
    legalName: z.string().max(120),
    /** Matricule fiscal / RNE — shown in the footer and the legal pages. */
    legalId: z.string().max(60),
    instagram: z.string().max(200),
    facebook: z.string().max(200),
    tiktok: z.string().max(200),
  }),
  hero: z.object({
    title: z.string().max(80),
    titleAr: z.string().max(80),
    /** Media id of the single picture set before banners existed; read through heroSlides. */
    imageId: z.string().max(40).nullable(),
    /** The home page's banners, in order: a picture, where it leads (see bannerLink), what it shows for screen readers. */
    slides: z.array(z.object({ imageId: z.string().min(1).max(40), link: z.string().max(300), alt: z.string().max(120), altAr: z.string().max(120) })).max(8).default([]),
  }),
  contact: z.object({
    /** 8 digits; empty hides the WhatsApp buttons. */
    whatsapp: z.string().max(20),
    /** m.me/<page> username; empty hides Messenger. */
    messenger: z.string().max(80),
  }),
  delivery: z.object({
    /** Name printed for the customer ("Livraison à domicile"); the carrier itself is per order. */
    carrierName: z.string().max(60),
    /** Millimes: one fee for every governorate the shop delivers to. */
    fee: z.number().int().min(0).max(100_000),
    zones: z.record(z.string(), deliveryZoneSchema),
    /** Millimes; null = no free delivery. */
    freeThreshold: z.number().int().min(0).nullable(),
    /** Whether the customer may open the parcel before paying (depends on the carrier). */
    openBeforePaying: z.boolean(),
  }),
  /** What the shop pays, for the profit figures. Never sent to the browser (not in publicSettings). */
  costs: z.object({
    /** Millimes the carrier charges the shop per parcel sent (delivered or not); null = not given. */
    carrierPerParcel: z.number().int().min(0).max(100_000).nullable(),
    /** Millimes a refused or returned parcel costs on top (the way back); null = not given. */
    returnPerParcel: z.number().int().min(0).max(100_000).nullable(),
  }),
  returns: z.object({
    /** Days after delivery. The law (2000-83) gives 10. */
    days: z.number().int().min(10).max(60),
  }),
  payments: z.object({
    cod: z.literal(true),
    /** Card payment through Konnect; needs keys below. */
    card: z.boolean(),
    konnectWalletId: z.string().max(80),
    konnectSandbox: z.boolean(),
  }),
  checkout: z.object({
    /** Ask for an e-mail at all (always optional). */
    askEmail: z.boolean(),
    /** Orders the same phone may place in 24 h before they are held. */
    maxOrdersPerPhonePerDay: z.number().int().min(1).max(20),
  }),
  tracking: z.object({
    metaPixelId: z.string().max(30),
    ga4Id: z.string().max(30),
    tiktokPixelId: z.string().max(40),
    /** When the ad platforms are told about a "Purchase": as soon as the order
     *  is placed, once it is confirmed by phone (fewer fake orders in the
     *  audiences the ads learn from), or once it is delivered and paid (the
     *  ads learn only from customers who really paid; fewer, later events). */
    purchaseAt: z.enum(["placed", "confirmed", "delivered"]),
  }),
  notify: z.object({
    /** SMS through a plain HTTP gateway. {to} {text} {key} are substituted. */
    smsUrl: z.string().max(400),
    smsMethod: z.enum(["GET", "POST"]),
    smsBody: z.string().max(400),
    smsSender: z.string().max(11),
    smsOnPlaced: z.boolean(),
    smsOnShipped: z.boolean(),
    /** Resend API sender address; the key is a secret. */
    emailFrom: z.string().max(120),
    /** Where each new order is sent by e-mail (the owner only); empty → the shop's e-mail. */
    orderAlertTo: z.string().max(120).default(""),
  }),
});

export type Settings = z.infer<typeof settingsSchema>;

/** Keys only the server ever reads. Never part of a public payload. */
export const secretsSchema = z.object({
  metaCapiToken: z.string().max(400),
  tiktokToken: z.string().max(400),
  ga4ApiSecret: z.string().max(200),
  konnectApiKey: z.string().max(200),
  smsKey: z.string().max(200),
  resendKey: z.string().max(200),
});
export type Secrets = z.infer<typeof secretsSchema>;

function defaultZones(): Record<string, DeliveryZone> {
  const zones: Record<string, DeliveryZone> = {};
  for (const g of GOVERNORATE_IDS) {
    zones[g] = GRAND_TUNIS.has(g)
      ? { minDays: 1, maxDays: 2, enabled: true }
      : { minDays: 2, maxDays: 3, enabled: true };
  }
  return zones;
}

export const DEFAULT_SETTINGS: Settings = {
  shop: {
    name: "Mena",
    tagline: "De belles choses, livrées chez vous. Vous payez à la réception.",
    taglineAr: "حاجات مزيانة توصلك لدارك، وتخلّص كي تستلم.",
    phone: "",
    email: "",
    address: "",
    legalName: "",
    legalId: "",
    instagram: "",
    facebook: "",
    tiktok: "",
  },
  hero: {
    title: "Choisi avec soin. Payé à la livraison.",
    titleAr: "مختار بعناية. تخلّص كي توصلك.",
    imageId: null,
    slides: [],
  },
  contact: { whatsapp: "", messenger: "" },
  delivery: {
    carrierName: "Livraison à domicile",
    fee: 8_000,
    zones: defaultZones(),
    freeThreshold: null,
    openBeforePaying: true,
  },
  costs: { carrierPerParcel: null, returnPerParcel: null },
  returns: { days: 10 },
  payments: { cod: true, card: false, konnectWalletId: "", konnectSandbox: true },
  checkout: { askEmail: false, maxOrdersPerPhonePerDay: 3 },
  tracking: { metaPixelId: "", ga4Id: "", tiktokPixelId: "", purchaseAt: "placed" },
  notify: {
    smsUrl: "",
    smsMethod: "GET",
    smsBody: "",
    smsSender: "MENA",
    smsOnPlaced: true,
    smsOnShipped: true,
    emailFrom: "",
    orderAlertTo: "",
  },
};

export const DEFAULT_SECRETS: Secrets = {
  metaCapiToken: "",
  tiktokToken: "",
  ga4ApiSecret: "",
  konnectApiKey: "",
  smsKey: "",
  resendKey: "",
};

/**
 * Stored JSON merged over the defaults, section by section: a setting added
 * later never breaks an old row, and one bad section falls back alone.
 */
export function mergeSettings(stored: unknown): Settings {
  const s = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const shape = settingsSchema.shape;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const def = DEFAULT_SETTINGS[key] as Record<string, unknown>;
    const v = s[key];
    const candidate: Record<string, unknown> = v && typeof v === "object" && !Array.isArray(v) ? { ...def, ...(v as object) } : def;
    if (key === "delivery") {
      const zones = (candidate.zones && typeof candidate.zones === "object" ? candidate.zones : {}) as Record<string, unknown>;
      candidate.zones = { ...DEFAULT_SETTINGS.delivery.zones, ...zones };
    }
    const parsed = shape[key].safeParse(candidate);
    out[key] = parsed.success ? parsed.data : def;
  }
  return out as Settings;
}

export function mergeSecrets(stored: unknown): Secrets {
  const parsed = secretsSchema.safeParse({ ...DEFAULT_SECRETS, ...(stored && typeof stored === "object" ? stored : {}) });
  return parsed.success ? parsed.data : DEFAULT_SECRETS;
}

/** What the browser may see. */
export function publicSettings(s: Settings) {
  return {
    shop: s.shop,
    contact: s.contact,
    delivery: s.delivery,
    returns: s.returns,
    payments: { cod: true, card: s.payments.card && Boolean(s.payments.konnectWalletId) },
    checkout: { askEmail: s.checkout.askEmail },
    tracking: { metaPixelId: s.tracking.metaPixelId, ga4Id: s.tracking.ga4Id, tiktokPixelId: s.tracking.tiktokPixelId, purchaseAt: s.tracking.purchaseAt },
  };
}
export type PublicSettings = ReturnType<typeof publicSettings>;

export type HeroSlide = Settings["hero"]["slides"][number];

/** The home banners: the list, or the single picture set before there could be several. */
export function heroSlides(h: Settings["hero"]): HeroSlide[] {
  // A copy of the settings cached before banners existed has no list.
  if (h.slides?.length) return h.slides;
  return h.imageId ? [{ imageId: h.imageId, link: "", alt: "", altAr: "" }] : [];
}

/**
 * Where a banner leads: a page of the shop ("/produit/…", "/categorie/…",
 * "/boutique"), opened in the visitor's language, or a full https address.
 * Anything else is no link (and is refused in the back office).
 */
export function bannerLink(link: string): { path: string } | { url: string } | null {
  const l = link.trim();
  if (!l) return null;
  if (/^\/(?!\/)[^\s]*$/.test(l)) return { path: l.replace(/^\/(ar|fr)(?=\/|$)/, "") || "/" };
  try {
    const u = new URL(l);
    return u.protocol === "https:" ? { url: u.toString() } : null;
  } catch {
    return null;
  }
}
