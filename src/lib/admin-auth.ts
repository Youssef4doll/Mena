import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { hashToken, newToken } from "./tokens";

export const ADMIN_COOKIE = "mena_admin";
const DAYS = 14;

export async function createAdminSession(userId: string) {
  const token = newToken(32);
  await prisma.adminSession.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + DAYS * 86_400_000) } });
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: DAYS * 86_400 });
}

export async function currentAdmin() {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const s = await prisma.adminSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: { id: true, email: true, name: true } } } });
  if (!s || s.expiresAt < new Date()) return null;
  return s.user;
}

/** Every admin page and action starts here. The proxy only redirects; this is the check. */
export async function requireAdmin() {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/connexion");
  return admin;
}

let dummyHash: string | null = null;

export async function verifyLogin(email: string, password: string) {
  const user = await prisma.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Compare against a dummy hash when there is no user, so timing does not reveal which e-mails exist.
  dummyHash ??= await bcrypt.hash("no-such-user", 10);
  const ok = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
  return ok && user ? user : null;
}

export async function destroyAdminSession() {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (token) await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(ADMIN_COOKIE);
}
