"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { saveSecrets, saveSettings, getSettings, SETTINGS_TAG } from "@/lib/settings";
import { settingsSchema, secretsSchema, type Settings, type Secrets } from "@/lib/settings-schema";
import { storeImage } from "@/lib/media";
import { normalizePhone } from "@/lib/phone";
import { CATALOG_TAG } from "@/lib/catalog";

export async function saveAll(settings: Settings, secrets: Partial<Secrets>) {
  await requireAdmin();
  const wa = settings.contact.whatsapp.trim();
  if (wa) {
    const n = normalizePhone(wa);
    if (!n) return { ok: false as const, error: "Numéro WhatsApp invalide (8 chiffres tunisiens)." };
    settings = { ...settings, contact: { ...settings.contact, whatsapp: n } };
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
    const m = await storeImage(Buffer.from(await f.arrayBuffer()), f.type);
    const s = await getSettings();
    await saveSettings({ ...s, hero: { ...s.hero, imageId: m.id } });
    updateTag(SETTINGS_TAG);
    revalidatePath("/admin/parametres");
    return { ok: true as const, id: m.id };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Image refusée." };
  }
}
