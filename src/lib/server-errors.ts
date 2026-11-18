import "server-only";
import { prisma } from "./prisma";

/**
 * The last server errors, kept in the database so the owner can read them
 * in the back office: the host's logs are not always at hand, and a
 * production page only shows a code (the digest) instead of the message.
 * Addresses of databases and anything that looks like a key are blanked
 * before saving.
 */
export type ServerError = { at: string; digest: string | null; path: string; kind: string; message: string; stack: string };

const KEY = "server-errors";
const KEEP = 20;

const clean = (s: string) =>
  s
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"]*@[^\s'"]*/gi, "[adresse masquée]")
    .replace(/\b(sk|re|pk|rk)[-_][A-Za-z0-9_-]{12,}/g, "[clé masquée]")
    .slice(0, 2000);

export async function recordServerError(e: Omit<ServerError, "at">) {
  try {
    const row = await prisma.setting.findUnique({ where: { key: KEY } });
    const list = (Array.isArray(row?.value) ? (row.value as ServerError[]) : []).slice(0, KEEP - 1);
    const entry: ServerError = { ...e, at: new Date().toISOString(), message: clean(e.message), stack: clean(e.stack) };
    await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: [entry, ...list] }, update: { value: [entry, ...list] } });
  } catch {
    // Recording must never add an error of its own (e.g. the database is the problem).
  }
}

export async function readServerErrors(): Promise<ServerError[]> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } }).catch(() => null);
  return Array.isArray(row?.value) ? (row.value as ServerError[]) : [];
}

/** A part of a page that can fail without taking the page down: recorded, and replaced by `fallback`. */
export async function soft<T>(work: Promise<T>, fallback: T, label: string): Promise<{ value: T; failed: boolean }> {
  try {
    return { value: await work, failed: false };
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(`[mena] ${label}:`, e);
    await recordServerError({ digest: null, path: label, kind: "partie de page", message: e.message, stack: (e.stack ?? "").split("\n").slice(0, 8).join("\n") });
    return { value: fallback, failed: true };
  }
}
