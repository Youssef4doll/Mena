/** Promo code rules, pure: the checkout and its tests share them. */

export type PromoInput = {
  code: string;
  kind: "PERCENT" | "FIXED" | "FREE_DELIVERY";
  value: number;
  minSubtotal: number;
  maxUses: number | null;
  usedCount: number;
  oncePerPhone: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
};

export type PromoResult =
  | { ok: true; discount: number; freeDelivery: boolean }
  | { ok: false; reason: "inactive" | "not_started" | "expired" | "used_up" | "min_subtotal" | "already_used" };

/** Percent discounts are rounded down to 100 millimes, so totals stay readable (89,900 not 89,937). */
export function evaluatePromo(p: PromoInput, ctx: { subtotal: number; now: Date; phoneAlreadyUsed: boolean }): PromoResult {
  if (!p.active) return { ok: false, reason: "inactive" };
  if (p.startsAt && ctx.now < p.startsAt) return { ok: false, reason: "not_started" };
  if (p.endsAt && ctx.now > p.endsAt) return { ok: false, reason: "expired" };
  if (p.maxUses != null && p.usedCount >= p.maxUses) return { ok: false, reason: "used_up" };
  if (ctx.subtotal < p.minSubtotal) return { ok: false, reason: "min_subtotal" };
  if (p.oncePerPhone && ctx.phoneAlreadyUsed) return { ok: false, reason: "already_used" };
  switch (p.kind) {
    case "PERCENT": {
      const pct = Math.min(90, Math.max(0, p.value));
      const raw = Math.floor((ctx.subtotal * pct) / 100);
      return { ok: true, discount: Math.floor(raw / 100) * 100, freeDelivery: false };
    }
    case "FIXED":
      return { ok: true, discount: Math.min(Math.max(0, p.value), ctx.subtotal), freeDelivery: false };
    case "FREE_DELIVERY":
      return { ok: true, discount: 0, freeDelivery: true };
  }
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}
