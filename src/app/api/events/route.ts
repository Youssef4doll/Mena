import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, limit, readJson } from "@/lib/http";
import { LIMITS } from "@/lib/rate-limit";
import { CLIENT_EVENTS } from "@/lib/events";
import { deviceFromUA, isBot } from "@/lib/device";

const id = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);
const body = z.object({
  visitorId: id,
  sessionId: id,
  source: z.string().max(60).optional(),
  medium: z.string().max(60).optional(),
  campaign: z.string().max(120).nullish(),
  /**
   * utm_content: the ad that brought the visit. A longer one is cut to the
   * 120 characters an order and the spend import keep, so the names still
   * match, instead of refusing the whole batch for one long link.
   */
  content: z
    .string()
    .nullish()
    .transform((s) => s?.slice(0, 120)),
  events: z
    .array(
      z.object({
        name: z.enum(CLIENT_EVENTS),
        path: z.string().max(200).optional(),
        productId: z.string().max(40).optional(),
        value: z.number().int().min(0).max(100_000_000).optional(),
        props: z.record(z.string().max(40), z.unknown()).optional(),
        at: z.iso.datetime().optional(),
      }),
    )
    .min(1)
    .max(25),
});

/**
 * First-party analytics intake. Refuses unknown event names, bots, property
 * bags over 1 KB and clocks more than a day off. The device class is read
 * from the request's User-Agent here, not from anything the page says.
 */
export async function POST(request: Request) {
  const ua = request.headers.get("user-agent");
  if (isBot(ua)) return json({ ok: true, accepted: 0 });
  const limited = limit(request, "events", LIMITS.events);
  if (limited) return limited;
  const parsed = body.safeParse(await readJson(request, 32_768));
  if (!parsed.success) return json({ ok: false }, 400);
  const d = parsed.data;
  const device = deviceFromUA(ua);
  const now = Date.now();
  const rows = d.events.flatMap((e) => {
    const props = e.props ? JSON.stringify(e.props) : null;
    if (props && props.length > 1024) return [];
    const at = e.at ? Date.parse(e.at) : now;
    return [
      {
        name: e.name,
        visitorId: d.visitorId,
        sessionId: d.sessionId,
        path: e.path,
        productId: e.productId,
        source: d.source ?? "direct",
        medium: d.medium,
        campaign: d.campaign ?? null,
        content: d.content ?? null,
        device,
        value: e.value,
        props: props ? JSON.parse(props) : undefined,
        createdAt: new Date(Math.abs(at - now) > 86_400_000 ? now : at),
      },
    ];
  });
  if (rows.length) await prisma.analyticsEvent.createMany({ data: rows });
  return json({ ok: true, accepted: rows.length });
}
