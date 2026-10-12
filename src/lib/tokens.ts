import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("APP_SECRET must be set (32+ characters).");
    return "dev-only-secret-not-for-production-use";
  }
  return s;
}

/** A URL-safe random secret. */
export function newToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/** Keyed hash: what is stored in place of a token, so a database leak does not leak working links. */
export function hashToken(token: string): string {
  return createHmac("sha256", secret()).update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** An IP, hashed with the secret and the day: groups abuse without keeping addresses. */
export function hashIp(ip: string): string {
  return createHmac("sha256", secret()).update(`${new Date().toISOString().slice(0, 10)}|${ip}`).digest("hex").slice(0, 32);
}

const REF_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** "MN-7K3Q9P": no 0/O or 1/I, easy to read over the phone. */
export function newOrderRef(): string {
  const b = randomBytes(6);
  let s = "";
  for (const x of b) s += REF_ALPHABET[x % REF_ALPHABET.length];
  return `MN-${s}`;
}

/** The tracking-link token of an order, recomputed from its salt. */
export function accessTokenFromSalt(salt: string): string {
  return createHmac("sha256", secret()).update(`order-access:${salt}`).digest("base64url").slice(0, 32);
}
