import type { Metadata } from "next";
import { RestoreCart } from "@/components/shop/RestoreCart";

export const metadata: Metadata = { robots: { index: false } };

export default async function RestoreRoute({ params }: PageProps<"/[lang]/panier/[id]">) {
  const { lang, id } = await params;
  return <RestoreCart id={id} lang={lang === "ar" ? "ar" : "fr"} />;
}
