/**
 * The shop's social profiles, as the shop shows them: only a real profile
 * on the right site. A bare "https://www.instagram.com/" or a link to
 * another site reads as a dead link, a scam signal to a cash-on-delivery
 * buyer; it is not shown, and the back office refuses to save it.
 */

export type Social = "instagram" | "facebook" | "tiktok";

const HOSTS: Record<Social, string[]> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com"],
  tiktok: ["tiktok.com"],
};
const NOT_A_PROFILE = new Set(["login", "accounts", "explore", "sharer", "sharer.php", "share", "dialog", "home.php", "watch", "groups", "hashtag", "tag", "search"]);

/** The profile's address (https), or "" when this is not a profile on that site. "@mena.tn" works for Instagram and TikTok. */
export function profileUrl(kind: Social, raw: string | null | undefined): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  if (/^@[\w.]{2,}$/.test(s) && kind !== "facebook") s = `https://www.${HOSTS[kind][0]}/${kind === "tiktok" ? s : s.slice(1)}`;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return "";
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|web|vm)\./, "");
  if (!HOSTS[kind].includes(host)) return "";
  const first = u.pathname.split("/").filter(Boolean)[0] ?? "";
  if (!first || NOT_A_PROFILE.has(first.toLowerCase())) return "";
  // A TikTok profile is "@name"; a Facebook "profile.php" needs its id.
  if (kind === "tiktok" && !first.startsWith("@")) return "";
  if (kind === "facebook" && first === "profile.php" && !u.searchParams.get("id")) return "";
  u.protocol = "https:";
  u.hash = "";
  return u.toString().replace(/\/$/, "");
}

/**
 * The Facebook page's username for m.me links, or "". Facebook usernames are
 * at least 5 letters, digits or dots: a page name like "Mena" would open
 * someone else's page, or none.
 */
export function messengerUser(raw: string | null | undefined): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  const m = /^(?:https?:\/\/)?(?:www\.|m\.|web\.)?(?:m\.me|facebook\.com|fb\.com|messenger\.com\/t)\/([^/?#]+)/i.exec(s);
  if (m) s = m[1];
  return /^[A-Za-z0-9.]{5,50}$/.test(s) && !/^\d+$/.test(s) && !NOT_A_PROFILE.has(s.toLowerCase()) ? s : "";
}

/** For the back office: what is wrong with a filled field, or null. */
export function socialProblem(kind: Social | "messenger", raw: string): string | null {
  if (!raw.trim()) return null;
  if (kind === "messenger")
    return messengerUser(raw) ? null : "Messenger : mettez le nom d'utilisateur de votre page Facebook, celui de son adresse (au moins 5 lettres ou chiffres, ex. mena.tn pour m.me/mena.tn), ou laissez vide.";
  const name = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" }[kind];
  const example = { instagram: "https://www.instagram.com/mena.tn", facebook: "https://www.facebook.com/mena.tn", tiktok: "https://www.tiktok.com/@mena.tn" }[kind];
  return profileUrl(kind, raw) ? null : `${name} : collez l'adresse de votre profil (ex. ${example}), ou laissez vide.`;
}
