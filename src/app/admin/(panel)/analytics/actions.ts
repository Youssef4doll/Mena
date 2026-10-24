"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { setExcluded } from "@/lib/internal";

/** Sets or clears the cookie that keeps this browser out of the statistics, even once signed out. */
export async function setDeviceExcluded(on: boolean) {
  await requireAdmin();
  await setExcluded(Boolean(on));
  revalidatePath("/admin/analytics");
}
