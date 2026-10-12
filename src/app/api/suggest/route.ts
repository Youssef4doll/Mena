import { NextResponse } from "next/server";
import { limit } from "@/lib/http";
import { LIMITS } from "@/lib/rate-limit";
import { suggest } from "@/lib/catalog";

export async function GET(request: Request) {
  const limited = limit(request, "suggest", LIMITS.suggest);
  if (limited) return limited;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const data = await suggest(q);
  return NextResponse.json(data, { headers: { "cache-control": "public, max-age=60, s-maxage=60" } });
}
