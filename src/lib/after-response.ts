import { after } from "next/server";

/**
 * Work that must happen but need not delay the answer: the owner's new-order
 * e-mail, the customer's SMS, the analytics row, the conversion sent to Meta.
 *
 * Normally it runs once the answer is sent (Next's `after`). On a host that
 * gives the server CPU only while it answers a request (Cloud Run's
 * request-based billing, where the image sets AFTER_INLINE=1), work left for
 * later can stall until the next visitor arrives; there it runs before the
 * answer instead: half a second slower, never lost. Either way a failure is
 * logged and never undoes the order.
 */
export async function afterResponse(task: () => Promise<void>): Promise<void> {
  const run = () => task().catch((e) => console.error("[after]", e));
  if (process.env.AFTER_INLINE === "1") {
    await run();
    return;
  }
  after(run);
}
