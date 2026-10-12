"use client";

import { useEffect } from "react";
import { track } from "@/lib/client/track";
import type { ClientEvent } from "@/lib/events";

/** Records one event when a server-rendered page is shown. */
export function TrackView({ name, productId, props }: { name: ClientEvent; productId?: string; props?: Record<string, unknown> }) {
  const key = JSON.stringify(props ?? {});
  useEffect(() => {
    track(name, { productId, props: JSON.parse(key) });
  }, [name, productId, key]);
  return null;
}
