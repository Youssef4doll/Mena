import { redirect } from "next/navigation";
import { href, isLang } from "@/i18n";

/** There is no basket any more: every product is ordered from its own page. Old links land in the shop. */
export default async function CheckoutRoute({ params }: PageProps<"/[lang]/commande">) {
  const { lang } = await params;
  redirect(href(isLang(lang) ? lang : "fr", "/boutique"));
}
