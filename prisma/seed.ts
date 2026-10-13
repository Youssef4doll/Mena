/**
 * The back-office account, from ADMIN_EMAIL / ADMIN_PASSWORD, on every deploy.
 * The variables are the source of truth: a new password set in Vercel takes
 * effect at the next deploy (and signs out open sessions). An unchanged
 * password changes nothing.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  // Spaces around a pasted password are a copy slip, never meant: the login trims them too.
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!email || !password) {
    console.warn("ADMIN_EMAIL / ADMIN_PASSWORD not set: no admin account created or updated. Add them in Vercel, then redeploy.");
    return;
  }
  if (password.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters.");
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing && (await bcrypt.compare(password, existing.passwordHash))) {
    console.log(`Admin ${email}: password unchanged.`);
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.adminUser.upsert({ where: { email }, create: { email, name: "Admin", passwordHash }, update: { passwordHash } });
  await prisma.adminSession.deleteMany({ where: { user: { email } } });
  console.log(existing ? `Admin ${email}: password updated.` : `Admin ${email} created.`);
}

main().finally(() => prisma.$disconnect());
