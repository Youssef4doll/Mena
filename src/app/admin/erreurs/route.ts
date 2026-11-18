import { currentAdmin } from "@/lib/admin-auth";
import { readServerErrors } from "@/lib/server-errors";

/** The last server errors, for a signed-in owner only (read by the back office's error page). */
export async function GET() {
  if (!(await currentAdmin())) return Response.json({ errors: [] }, { status: 401 });
  return Response.json({ errors: await readServerErrors() }, { headers: { "cache-control": "private, no-store" } });
}
