import type { Instrumentation } from "next";

/** Every server error is also kept for the back office (src/lib/server-errors.ts). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const e = err instanceof Error ? err : new Error(String(err));
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : null;
  const { recordServerError } = await import("@/lib/server-errors");
  await recordServerError({
    digest,
    path: `${request.method} ${request.path.split("?")[0]}`,
    kind: `${context.routeType} ${context.routePath}`,
    message: e.message,
    stack: (e.stack ?? "").split("\n").slice(0, 8).join("\n"),
  });
};
