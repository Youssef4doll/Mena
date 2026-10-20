import "server-only";
import { getSecrets, getSettings } from "@/lib/settings";
import { adCosts, baseline } from "@/lib/ads/data";
import type { TrackingSetup } from "@/lib/ads/advisor";
import type { Baseline, Costs } from "@/lib/ads/types";

/**
 * What every "Publicités" tab reads besides its own rows: the shop's costs,
 * its usual rates, and how the ad tracking is set up. The tracking setup is
 * booleans only: a token never leaves this function, the pages only learn
 * whether one is there.
 *
 *   trackingSetup()  → TrackingSetup                    for advise() and the tracking checklist
 *   adsBasics(to)    → { costs, baseline, tracking }    in one wait
 */

export async function trackingSetup(): Promise<TrackingSetup> {
  const [settings, secrets] = await Promise.all([getSettings(), getSecrets()]);
  const t = settings.tracking;
  return {
    metaPixel: t.metaPixelId.trim() !== "",
    tiktokPixel: t.tiktokPixelId.trim() !== "",
    metaCapi: secrets.metaCapiToken.trim() !== "",
    tiktokEvents: secrets.tiktokToken.trim() !== "",
    purchaseAt: t.purchaseAt,
  };
}

/**
 * The shared context of a period ending at `to`. The shop's rates are read
 * up to the end of the period, or up to now for a period that ends tonight:
 * an order is "old enough to be final" counted from today, not from tomorrow.
 */
export async function adsBasics(to: Date): Promise<{ costs: Costs; baseline: Baseline; tracking: TrackingSetup }> {
  const until = new Date(Math.min(to.getTime(), Date.now()));
  // The costs also give the shop's margin per delivered order.
  const costsRead = adCosts();
  const [costs, base, tracking] = await Promise.all([costsRead, costsRead.then((c) => baseline(until, c)), trackingSetup()]);
  return { costs, baseline: base, tracking };
}
