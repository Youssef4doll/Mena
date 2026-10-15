"use client";

import { track } from "@/lib/client/track";

/**
 * Which product was opened from which list, and at which place: search →
 * product → order can then be followed. One listener for the whole list.
 */
export function ListClicks({ list, q, children }: { list: string; q?: string; children: React.ReactNode }) {
  return (
    <div
      className="contents"
      onClickCapture={(e) => {
        const a = (e.target as HTMLElement).closest<HTMLElement>("[data-slug]");
        if (!a) return;
        track("list_item_clicked", { props: { list, slug: a.dataset.slug, position: Number(a.dataset.pos) + 1, ...(q ? { q: q.toLowerCase().slice(0, 80) } : {}) } });
      }}
    >
      {children}
    </div>
  );
}
