"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { saveSecrets, saveSettingsMerged, SETTINGS_TAG } from "@/lib/settings";
import { fieldName } from "@/lib/settings-labels";
import { bannerLink, settingsSchema, secretsSchema, type Settings, type Secrets } from "@/lib/settings-schema";
import { storeImage } from "@/lib/media";
import { normalizePhone } from "@/lib/phone";
import { CATALOG_TAG } from "@/lib/catalog";
import { messengerUser, profileUrl, socialProblem } from "@/lib/social";
import { getSettings } from "@/lib/settings";
import { deliverEmail } from "@/lib/notify";

/** A refusal, with the field it is about ("contact.messenger"), so the form can show it there. */
type Refusal = { ok: false; error: string; field?: string };
export type SaveResult = { ok: true; settings: Settings; changed: string[] } | Refusal;

/**
 * Ad pixel ids have one known shape each: an e-mail or a password a browser
 * typed into the field is refused there, instead of reaching every page.
 */
function trackingProblem(t: Settings["tracking"]): Refusal | null {
  if (t.metaPixelId.trim() && !/^\d{10,20}$/.test(t.metaPixelId.trim())) return { ok: false, field: "tracking.metaPixelId", error: "Meta Pixel ID : seulement des chiffres (15 ou 16 en général)." };
  if (t.ga4Id.trim() && !/^G-[A-Z0-9]{4,15}$/.test(t.ga4Id.trim())) return { ok: false, field: "tracking.ga4Id", error: "GA4 ID : de la forme G-XXXXXXXXXX." };
  if (t.gtmId.trim() && !/^GTM-[A-Z0-9]{4,12}$/.test(t.gtmId.trim())) return { ok: false, field: "tracking.gtmId", error: "Google Tag Manager ID : de la forme GTM-XXXXXXX." };
  if (t.tiktokPixelId.trim() && !/^[A-Z0-9]{10,30}$/.test(t.tiktokPixelId.trim())) return { ok: false, field: "tracking.tiktokPixelId", error: "TikTok Pixel ID : lettres majuscules et chiffres seulement." };
  return null;
}

/**
 * Saves what the form changed since it was opened (`base`), onto what is
 * stored now: a change made meanwhile in another tab or on another device is
 * kept, and the same field changed in both places is refused by name. Then
 * answers with the settings as stored, read back.
 */
export async function saveAll(base: Settings, settings: Settings, secrets: Partial<Secrets>): Promise<SaveResult> {
  await requireAdmin();
  const wa = settings.contact.whatsapp.trim();
  if (wa) {
    const n = normalizePhone(wa);
    if (!n) return { ok: false, field: "contact.whatsapp", error: "Numéro WhatsApp invalide (8 chiffres tunisiens)." };
    settings = { ...settings, contact: { ...settings.contact, whatsapp: n } };
  }
  // Social links: a real profile on the right site or nothing (a bare "instagram.com/" reads as a scam signal).
  for (const k of ["instagram", "facebook", "tiktok"] as const) {
    const problem = socialProblem(k, settings.shop[k]);
    if (problem) return { ok: false, field: `shop.${k}`, error: problem };
  }
  const messengerProblem = socialProblem("messenger", settings.contact.messenger);
  if (messengerProblem) return { ok: false, field: "contact.messenger", error: messengerProblem };
  const tracking = { ...settings.tracking, metaPixelId: settings.tracking.metaPixelId.trim(), ga4Id: settings.tracking.ga4Id.trim(), gtmId: settings.tracking.gtmId.trim(), tiktokPixelId: settings.tracking.tiktokPixelId.trim() };
  const trackingRefused = trackingProblem(tracking);
  if (trackingRefused) return trackingRefused;
  settings = {
    ...settings,
    tracking,
    shop: { ...settings.shop, instagram: profileUrl("instagram", settings.shop.instagram), facebook: profileUrl("facebook", settings.shop.facebook), tiktok: profileUrl("tiktok", settings.shop.tiktok) },
    contact: { ...settings.contact, messenger: messengerUser(settings.contact.messenger) },
  };
  // A banner leads to a page of the shop or an https address, or nowhere.
  for (const [i, b] of (settings.hero.slides ?? []).entries()) {
    if (b.link.trim() && !bannerLink(b.link)) return { ok: false, field: "hero.slides", error: `Photo d'accueil ${i + 1} : le lien doit être une page de la boutique (/produit/…, /categorie/…) ou une adresse https.` };
  }
  for (const [g, z] of Object.entries(settings.delivery.zones)) {
    if (z.maxDays < z.minDays) return { ok: false, field: "delivery.zones", error: `${g} : le délai maximum est plus court que le minimum.` };
  }
  const parsed = settingsSchema.safeParse(settings);
  if (!parsed.success) return { ok: false, field: parsed.error.issues[0]?.path.slice(0, 2).join("."), error: `Champ invalide : ${parsed.error.issues[0]?.path.join(" › ")}` };
  const baseParsed = settingsSchema.safeParse(base);
  if (!baseParsed.success) return { ok: false, error: "Page trop ancienne : rechargez-la." };
  const sec = secretsSchema.partial().safeParse(secrets);
  if (!sec.success) return { ok: false, error: "Clé invalide." };
  const r = await saveSettingsMerged(baseParsed.data, parsed.data);
  if (!r.ok) {
    if ("invalid" in r) return { ok: false, field: r.invalid.split(".").slice(0, 2).join("."), error: `Champ invalide : ${r.invalid}` };
    return { ok: false, field: r.conflicts[0], error: `Modifié entre-temps dans un autre onglet ou sur un autre appareil : ${r.conflicts.map(fieldName).join(", ")}. Rien n'est enregistré : rechargez la page pour voir la valeur actuelle.` };
  }
  await saveSecrets(sec.data);
  updateTag(SETTINGS_TAG);
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/parametres");
  return { ok: true, settings: r.settings, changed: [...r.changed.map(fieldName), ...Object.entries(sec.data).filter(([, v]) => v).map(([k]) => fieldName(`secrets.${k}`))] };
}

export async function uploadHero(form: FormData) {
  await requireAdmin();
  const f = form.get("file");
  if (!(f instanceof File) || f.size === 0) return { ok: false as const, error: "Aucune image." };
  try {
    // Stored only: the banner joins the list on the page and is saved with the other settings.
    const m = await storeImage(Buffer.from(await f.arrayBuffer()), f.type);
    return { ok: true as const, id: m.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Image refusée." };
  }
}

/** A test of the new-order e-mail, with the saved settings: sent, or Resend's reason in plain words. */
export async function testOrderEmail(): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  await requireAdmin();
  const settings = await getSettings();
  const to = (settings.notify.orderAlertTo || settings.shop.email).trim();
  if (!to) return { ok: false, error: "Écrivez d'abord votre e-mail dans « Recevoir chaque nouvelle commande à », puis enregistrez." };
  const r = await deliverEmail({ to, subject: "Mena : test des alertes de commande", text: "Ceci est un test. Chaque nouvelle commande de Mena arrivera ici, avec le client, le téléphone, l'adresse, les articles et le total." });
  if (r.status === "SENT") return { ok: true, to };
  if (r.status === "NOT_CONFIGURED") return { ok: false, error: "Collez d'abord la clé API Resend, puis enregistrez." };
  if (/HTTP 403/.test(r.error)) return { ok: false, error: `Resend refuse : sans nom de domaine vérifié, il n'envoie qu'à l'adresse de votre compte Resend. Mettez cette adresse dans « Recevoir chaque nouvelle commande à » (${r.error}).` };
  if (/HTTP 401/.test(r.error)) return { ok: false, error: `Clé Resend refusée : vérifiez-la (${r.error}).` };
  return { ok: false, error: `Envoi impossible : ${r.error}` };
}
