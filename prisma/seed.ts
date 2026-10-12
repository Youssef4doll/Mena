/**
 * First run: the back-office account from ADMIN_EMAIL / ADMIN_PASSWORD.
 * Idempotent — running it again changes nothing for an existing account
 * unless ADMIN_RESET=1, which resets that account's password.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD.");
  if (password.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters.");
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing && process.env.ADMIN_RESET !== "1") {
    console.log(`Admin ${email} already exists.`);
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.adminUser.upsert({ where: { email }, create: { email, name: "Youssef", passwordHash }, update: { passwordHash } });
  await prisma.adminSession.deleteMany({ where: { user: { email } } });
  console.log(`Admin ${email} ready.`);
}

main().finally(() => prisma.$disconnect());
