import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "./prisma";
import { mergeSecrets, mergeSettings, settingsSchema, type Secrets, type Settings } from "./settings-schema";
import { applyChanges, changedFields } from "./settings-merge";

export const SETTINGS_TAG = "settings";

/** Cached: every page reads the settings, and they change a few times a month. The key changes with their shape (v2: one delivery fee). */
export const getSettings = unstable_cache(
  async (): Promise<Settings> => {
    const row = await prisma.setting.findUnique({ where: { key: "settings" } });
    return mergeSettings(row?.value);
  },
  ["settings-v4"],
  { tags: [SETTINGS_TAG], revalidate: 300 },
);

/**
 * The settings as stored right now, never from the cache, with the time of
 * their last save: the settings form starts from these, so it never shows
 * (and later saves back) an older copy.
 */
export async function readSettingsFresh(): Promise<{ settings: Settings; version: string | null }> {
  const row = await prisma.setting.findUnique({ where: { key: "settings" } });
  return { settings: mergeSettings(row?.value), version: row?.updatedAt.toISOString() ?? null };
}

/** Secrets are never cached alongside the settings and never leave the server. */
export async function getSecrets(): Promise<Secrets> {
  const row = await prisma.setting.findUnique({ where: { key: "secrets" } });
  return mergeSecrets(row?.value);
}

export type MergedSave = { ok: true; settings: Settings; version: string; changed: string[] } | { ok: false; conflicts: string[] } | { ok: false; invalid: string };

/**
 * Only what the form changed (from `base`, what it was opened with) is
 * written, onto the settings as stored now, and only if nobody saved in
 * between this read and this write (else it reads again). A field changed
 * both here and elsewhere since the form was opened is refused by name.
 * Answers with what is now stored, read back from the database.
 */
export async function saveSettingsMerged(base: Settings, next: Settings): Promise<MergedSave> {
  const changes = changedFields(base, next);
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await prisma.setting.findUnique({ where: { key: "settings" } });
    const current = mergeSettings(row?.value);
    const { merged, conflicts } = applyChanges(current, base, changes);
    if (conflicts.length) return { ok: false, conflicts };
    const parsed = settingsSchema.safeParse(merged);
    if (!parsed.success) return { ok: false, invalid: parsed.error.issues[0]?.path.join(".") ?? "" };
    if (changes.length) {
      if (row) {
        const { count } = await prisma.setting.updateMany({ where: { key: "settings", updatedAt: row.updatedAt }, data: { value: parsed.data } });
        if (count === 0) continue;
      } else {
        await prisma.setting.create({ data: { key: "settings", value: parsed.data } }).catch(() => null);
      }
      revalidateTag(SETTINGS_TAG, "max");
    }
    const stored = await readSettingsFresh();
    return { ok: true, settings: stored.settings, version: stored.version ?? "", changed: changes.map((c) => c.path) };
  }
  return { ok: false, conflicts: ["*"] };
}

/** Empty strings leave a secret unchanged: the form never shows the stored value back. */
export async function saveSecrets(patch: Partial<Secrets>) {
  const current = await getSecrets();
  const next = { ...current };
  for (const [k, v] of Object.entries(patch) as [keyof Secrets, string][]) {
    if (v === "__clear__") next[k] = "";
    else if (v) next[k] = v;
  }
  await prisma.setting.upsert({
    where: { key: "secrets" },
    create: { key: "secrets", value: next },
    update: { value: next },
  });
}
