"use client";

import { usePathname } from "next/navigation";
import PanelLoading from "../loading";
import { EditorSkeleton } from "./[id]/EditorSkeleton";

/**
 * The one loading boundary under "Produits". Opening a product from this list
 * stays inside "Produits", so the back office's skeleton above would not show;
 * this one does, shaped like the page being opened. A second boundary inside
 * the product's own folder would make React hold each skeleton for its
 * minimum time in turn, and opening a product would wait twice.
 */
export default function Loading() {
  const path = usePathname();
  const editor = /^\/admin\/produits\/(?!import$|traduction$)[^/]+$/.test(path);
  return editor ? <EditorSkeleton /> : <PanelLoading />;
}
