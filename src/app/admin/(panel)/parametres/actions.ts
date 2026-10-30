"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { saveSecrets, saveSettings, SETTINGS_TAG } from "@/lib/settings";
import { bannerLink, settingsSchema, secretsSchema, type Settings, type Secrets } from "@/lib/settings-schema";
import { storeImage } from "@/lib/media";
import { normalizePhone } from "@/lib/phone";
import { CATALOG_TAG } from "@/lib/catalog";
import { messengerUser, profileUrl, socialProblem } from "@/lib/social";
import { getSettings } from "@/lib/settings";
import { deliverEmail } from "@/lib/notify";

export async function saveAll(settings: Settings, secrets: Partial<Secrets>) {
  await requireAdmin();
  const wa = settings.contact.whatsapp.trim();
  if (wa) {
    const n = normalizePhone(wa);
    if (!n) return { ok: false as const, error: "Numéro WhatsApp invalide (8 chiffres tunisiens)." };
    settings = { ...settings, contact: { ...settings.contact, whatsapp: n } };
  }
  // Social links: a real profile on the right site or nothing (a bare "instagram.com/" reads as a scam signal).
  for (const k of ["instagram", "facebook", "tiktok"] as const) {
    const problem = socialProblem(k, settings.shop[k]);
    if (problem) return { ok: false as const, error: problem };
  }
  const messengerProblem = socialProblem("messenger", settings.contact.messenger);
  if (messengerProblem) return { ok: false as const, error: messengerProblem };
  settings = {
    ...settings,
    shop: { ...settings.shop, instagram: profileUrl("instagram", settings.shop.instagram), facebook: profileUrl("facebook", settings.shop.facebook), tiktok: profileUrl("tiktok", settings.shop.tiktok) },
    contact: { ...settings.contact, messenger: messengerUser(settings.contact.messenger) },
  };
  // A banner leads to a page of the shop or an https address, or nowhere.
  for (const [i, b] of (settings.hero.slides ?? []).entries()) {
    if (b.link.trim() && !bannerLink(b.link)) return { ok: false as const, error: `Photo d'accueil ${i + 1} : le lien doit être une page de la boutique (/produit/…, /categorie/…) ou une adresse https.` };
  }
  for (const [g, z] of Object.entries(settings.delivery.zones)) {
    if (z.maxDays < z.minDays) return { ok: false as const, error: `${g} : le délai maximum est plus court que le minimum.` };
  }
  const parsed = settingsSchema.safeParse(settings);
  if (!parsed.success) return { ok: false as const, error: `Champ invalide : ${parsed.error.issues[0]?.path.join(" › ")}` };
  const sec = secretsSchema.partial().safeParse(secrets);
  if (!sec.success) return { ok: false as const, error: "Clé invalide." };
  await saveSettings(parsed.data);
  await saveSecrets(sec.data);
  updateTag(SETTINGS_TAG);
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/parametres");
  return { ok: true as const };
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
