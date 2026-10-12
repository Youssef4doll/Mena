"use client";

import { useEffect } from "react";
import { pixelSearch } from "@/lib/client/pixels";

export function SearchPixel({ q }: { q: string }) {
  useEffect(() => pixelSearch(q), [q]);
  return null;
}
