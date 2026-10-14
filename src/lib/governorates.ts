/** The 24 governorates, with the Arabic name shown when the site is in Arabic. */
export const GOVERNORATES = [
  { id: "Tunis", ar: "تونس" },
  { id: "Ariana", ar: "أريانة" },
  { id: "Ben Arous", ar: "بن عروس" },
  { id: "Manouba", ar: "منوبة" },
  { id: "Nabeul", ar: "نابل" },
  { id: "Zaghouan", ar: "زغوان" },
  { id: "Bizerte", ar: "بنزرت" },
  { id: "Béja", ar: "باجة" },
  { id: "Jendouba", ar: "جندوبة" },
  { id: "Le Kef", ar: "الكاف" },
  { id: "Siliana", ar: "سليانة" },
  { id: "Sousse", ar: "سوسة" },
  { id: "Monastir", ar: "المنستير" },
  { id: "Mahdia", ar: "المهدية" },
  { id: "Sfax", ar: "صفاقس" },
  { id: "Kairouan", ar: "القيروان" },
  { id: "Kasserine", ar: "القصرين" },
  { id: "Sidi Bouzid", ar: "سيدي بوزيد" },
  { id: "Gabès", ar: "قابس" },
  { id: "Médenine", ar: "مدنين" },
  { id: "Tataouine", ar: "تطاوين" },
  { id: "Gafsa", ar: "قفصة" },
  { id: "Tozeur", ar: "توزر" },
  { id: "Kébili", ar: "قبلي" },
] as const;

export type Governorate = (typeof GOVERNORATES)[number]["id"];

export const GOVERNORATE_IDS: readonly string[] = GOVERNORATES.map((g) => g.id);

export const GRAND_TUNIS = new Set<string>(["Tunis", "Ariana", "Ben Arous", "Manouba"]);

export function isGovernorate(v: string): v is Governorate {
  return GOVERNORATE_IDS.includes(v);
}

export function governorateLabel(id: string, locale: "fr" | "ar"): string {
  if (locale === "fr") return id;
  return GOVERNORATES.find((g) => g.id === id)?.ar ?? id;
}

/** "Livraison 24 gouvernorats" is said only while the shop really delivers to all of them. */
export function deliversEverywhere(zones: Record<string, { enabled: boolean } | undefined>): boolean {
  return GOVERNORATES.every((g) => zones[g.id]?.enabled !== false);
}
