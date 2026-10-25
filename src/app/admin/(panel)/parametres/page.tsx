import { getSecrets, getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { PageTitle } from "@/components/admin/ui";
import { SettingsForm } from "./SettingsForm";

export const metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const [settings, secrets, categories, products] = await Promise.all([
    getSettings(),
    getSecrets(),
    prisma.category.findMany({ where: { active: true }, orderBy: [{ sort: "asc" }, { name: "asc" }], select: { slug: true, name: true } }),
    prisma.product.findMany({ where: { active: true }, orderBy: { name: "asc" }, take: 1000, select: { slug: true, name: true } }),
  ]);
  // Secrets never travel back to the browser: only whether each one is set.
  const isSet = Object.fromEntries(Object.entries(secrets).map(([k, v]) => [k, Boolean(v)])) as Record<keyof typeof secrets, boolean>;
  return (
    <>
      <PageTitle title="Paramètres" sub="Tout ce qui est réglé ici s'applique immédiatement à la boutique et aux calculs du serveur." />
      <SettingsForm initial={settings} secretsSet={isSet} targets={{ categories, products }} />
    </>
  );
}
