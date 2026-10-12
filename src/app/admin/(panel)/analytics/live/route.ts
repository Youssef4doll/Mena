import { currentAdmin } from "@/lib/admin-auth";
import { getLive } from "@/lib/analytics";

export async function GET() {
  if (!(await currentAdmin())) return new Response("Unauthorized", { status: 401 });
  return Response.json(await getLive(), { headers: { "cache-control": "no-store" } });
}
