"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminSession, verifyLogin } from "@/lib/admin-auth";
import { callerIp, hit, LIMITS } from "@/lib/rate-limit";
import { hasSecret } from "@/lib/tokens";

export async function login(_prev: unknown, form: FormData) {
  // Said in words: without it the session cannot be made, and the page would only show an error code.
  if (!hasSecret()) return { error: "Le serveur n'a pas sa clé APP_SECRET (32 caractères ou plus). Ajoutez-la dans les variables d'environnement de l'hébergeur, puis republiez." };
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const ip = callerIp(await headers());
  const gate = hit(`login:${ip}`, LIMITS.login.limit, LIMITS.login.windowMs);
  if (!gate.ok) return { error: `Trop de tentatives. Réessayez dans ${Math.ceil(gate.retryAfter / 60)} min.` };
  const user = await verifyLogin(email, password);
  if (!user) return { error: "E-mail ou mot de passe incorrect." };
  await createAdminSession(user.id);
  redirect("/admin");
}
