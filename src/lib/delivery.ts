import type { Locale } from "./money";

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
