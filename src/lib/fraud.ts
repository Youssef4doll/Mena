/**
 * What the shop should know before it calls a customer back. Pure.
 *
 * Nothing here refuses an order: a flagged order is still placed and is
 * shown first, with its reasons, to whoever makes the confirmation call.
 * A real customer with a bad history is still a customer; the call decides.
 */

export type CustomerHistory = {
  blacklisted: boolean;
  delivered: number;
  refused: number;
  /** Orders by this phone in the last 24 hours, cancelled ones included. */
  last24h: number;
  /** An open order (not cancelled/delivered/refused) sharing a product with this one, in the last 48 hours. */
  duplicateOpen: boolean;
};

export function orderFlags(h: CustomerHistory, opts: { maxPerDay: number; phoneIsMobile: boolean }): string[] {
  const flags: string[] = [];
  if (h.blacklisted) flags.push("blacklisted");
  if (h.refused > 0) flags.push(`past_refusals:${h.refused}`);
  if (h.refused >= 2 && h.refused >= h.delivered) flags.push("serial_refuser");
  if (h.delivered > 0) flags.push(`past_delivered:${h.delivered}`);
  if (h.duplicateOpen) flags.push("duplicate");
  if (h.last24h >= opts.maxPerDay) flags.push("too_many_today");
  if (!opts.phoneIsMobile) flags.push("landline");
  return flags;
}

/** Flags that put an order at the top of the confirmation queue. */
export const RISK_FLAGS = ["blacklisted", "serial_refuser", "duplicate", "too_many_today"];

export function isRisky(flags: string[]): boolean {
  return flags.some((f) => RISK_FLAGS.includes(f.split(":")[0]));
}

/** Refusal rate a customer is judged on: refused / (delivered + refused). */
export function refusalRate(delivered: number, refused: number): number | null {
  const n = delivered + refused;
  return n === 0 ? null : refused / n;
}
