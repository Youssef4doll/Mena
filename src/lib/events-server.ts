import "server-only";
import { prisma } from "./prisma";
import type { ServerEvent } from "./events";

/**
 * Funnel steps only the server sees (an order placed, confirmed, delivered…),
 * written into the same table as the browser's events so one query reads the
 * whole funnel. Carries the order's visitor/session so it joins the visit
 * that produced it. Never a name, phone or address.
 */
export async function recordOrderEvent(
  name: ServerEvent,
  order: { id: string; total: number; visitorId: string | null; sessionId: string | null; source: string | null; medium: string | null; campaign: string | null; device: string | null; governorate: string },
  props: Record<string, unknown> = {},
) {
  try {
    await prisma.analyticsEvent.create({
      data: {
        name,
        visitorId: order.visitorId ?? "server",
        sessionId: order.sessionId ?? "server",
        orderId: order.id,
        value: order.total,
        source: order.source,
        medium: order.medium,
        campaign: order.campaign,
        device: order.device,
        props: { ...props, governorate: order.governorate, server: true },
      },
    });
  } catch (e) {
    console.error(`[events] ${name} not recorded`, e);
  }
}
