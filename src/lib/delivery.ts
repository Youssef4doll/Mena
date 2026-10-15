import type { Locale } from "./money";

/** The shortest and longest delay over the governorates the shop delivers to; null when it delivers nowhere. */
export function deliverySpan(zones: Record<string, { minDays: number; maxDays: number; enabled: boolean }>): { minDays: number; maxDays: number } | null {
  const on = Object.values(zones).filter((z) => z.enabled);
  if (!on.length) return null;
  return { minDays: Math.min(...on.map((z) => z.minDays)), maxDays: Math.max(...on.map((z) => Math.max(z.minDays, z.maxDays))) };
}

/** "1 à 2 jours ouvrés" / "خلال 1 إلى 2 أيام عمل". A range the shop set, never a promised date. */
export function deliveryRangeLabel(minDays: number, maxDays: number, locale: Locale): string {
  const max = Math.max(minDays, maxDays);
  if (locale === "ar") {
    if (max === 0) return "نفس اليوم";
    if (minDays === max) return `خلال ${max} ${max === 1 ? "يوم عمل" : "أيام عمل"}`;
    return `خلال ${minDays} إلى ${max} أيام عمل`;
  }
  if (max === 0) return "le jour même";
  if (minDays === max) return `${max} jour${max > 1 ? "s" : ""} ouvré${max > 1 ? "s" : ""}`;
  return `${minDays} à ${max} jours ouvrés`;
}
