import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "./prisma";
import { mergeSecrets, mergeSettings, type Secrets, type Settings } from "./settings-schema";

export const SETTINGS_TAG = "settings";

/** Cached: every page reads the settings, and they change a few times a month. */
export const getSettings = unstable_cache(
  async (): Promise<Settings> => {
    const row = await prisma.setting.findUnique({ where: { key: "settings" } });
    return mergeSettings(row?.value);
  },
  ["settings-v1"],
  { tags: [SETTINGS_TAG], revalidate: 300 },
);

/** Secrets are never cached alongside the settings and never leave the server. */
export async function getSecrets(): Promise<Secrets> {
  const row = await prisma.setting.findUnique({ where: { key: "secrets" } });
  return mergeSecrets(row?.value);
}

export async function saveSettings(next: Settings) {
  await prisma.setting.upsert({
    where: { key: "settings" },
    create: { key: "settings", value: next },
    update: { value: next },
  });
  revalidateTag(SETTINGS_TAG, "max");
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
