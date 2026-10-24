import "server-only";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, currentAdmin } from "./admin-auth";

/**
 * A visit by the shop itself: a browser signed in to the back office, or a
 * device the owner excluded (a tester's phone). Its page views, forms and
 * typed numbers are not counted in the statistics nor listed among the
 * unfinished orders to call: with a hundred visits a month, a few internal
 * sessions would change the conversion rate.
 */
export const INTERNAL_COOKIE = "mena_internal";

export async function isInternal(): Promise<boolean> {
  const jar = await cookies();
  if (jar.get(INTERNAL_COOKIE)?.value === "1") return true;
  if (!jar.get(ADMIN_COOKIE)) return false;
  return Boolean(await currentAdmin());
}

export async function setExcluded(on: boolean) {
  const jar = await cookies();
  if (on) jar.set(INTERNAL_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 400 });
  else jar.delete(INTERNAL_COOKIE);
}

export async function isExcluded(): Promise<boolean> {
  return (await cookies()).get(INTERNAL_COOKIE)?.value === "1";
}
