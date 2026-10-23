"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { CATALOG_TAG } from "@/lib/catalog";
import { translationReady } from "@/lib/translate";
import { arabicCategory, lacksArabic, type CategoryArabic, type CategoryText } from "@/lib/category-ar";
import { translateCategoryTexts } from "@/lib/category-ai";

export type Outcome = { ok: true; done: number; left: CategoryText[] } | { ok: false; error: string; left: CategoryText[] };

const missing = async (): Promise<CategoryText[]> =>
  (await prisma.category.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }], select: { id: true, name: true, nameAr: true, headline: true, headlineAr: true } }))
    .map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr ?? "", headline: c.headline ?? "", headlineAr: c.headlineAr ?? "" }))
    .filter(lacksArabic);

/** Only what is empty is written: an Arabic name or title typed by the owner stays. */
async function save(answers: CategoryArabic[], todo: CategoryText[]): Promise<number> {
  let done = 0;
  for (const a of answers) {
    const c = todo.find((t) => t.id === a.id);
    if (!c) continue;
    const data = {
      ...(!c.nameAr.trim() && a.nameAr ? { nameAr: a.nameAr.slice(0, 60) } : {}),
      ...(!c.headlineAr.trim() && c.headline.trim() && a.headlineAr ? { headlineAr: a.headlineAr.slice(0, 60) } : {}),
    };
    if (!Object.keys(data).length) continue;
    const r = await prisma.category.updateMany({ where: { id: c.id, ...(data.nameAr ? { OR: [{ nameAr: null }, { nameAr: "" }] } : {}) }, data });
    done += r.count;
  }
  if (done) {
    updateTag(CATALOG_TAG);
    revalidatePath("/admin/categories");
  }
  return done;
}

/**
 * The categories without Arabic: the common names from the shop's own list,
 * the others by the AI when the key is there. What is left (no key) comes
 * back, for claude.ai.
 */
export async function translateCategories(): Promise<Outcome> {
  await requireAdmin();
  let todo = await missing();
  const known = todo.flatMap((c) => (!c.nameAr.trim() && arabicCategory(c.name) ? [{ id: c.id, nameAr: arabicCategory(c.name), headlineAr: "" }] : []));
  let done = await save(known, todo);
  todo = await missing();
  if (!todo.length || !translationReady()) return { ok: true, done, left: todo };
  try {
    done += await save(await translateCategoryTexts(todo), todo);
    return { ok: true, done, left: await missing() };
  } catch (e) {
    const error = e instanceof Anthropic.AuthenticationError ? "La clé ANTHROPIC_API_KEY est refusée : vérifiez-la dans Vercel." : "L'IA ne répond pas pour le moment. Réessayez plus tard.";
    return { ok: false, error, left: todo };
  }
}

const answers = z.array(z.object({ id: z.string().min(1).max(40), nameAr: z.string().max(60), headlineAr: z.string().max(60) })).max(500);

/** The reply of claude.ai pasted back, for the categories still without Arabic. */
export async function saveCategoryArabic(raw: CategoryArabic[]): Promise<Outcome> {
  await requireAdmin();
  const parsed = answers.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Réponse invalide.", left: await missing() };
  const done = await save(parsed.data, await missing());
  return { ok: true, done, left: await missing() };
}
