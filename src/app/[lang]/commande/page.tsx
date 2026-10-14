import { redirect } from "next/navigation";
import { DEFAULT_LANG, href, isLang } from "@/i18n";

/** The old checkout address: the order of several products is now placed from the basket. */
export default async function CheckoutRoute({ params }: PageProps<"/[lang]/commande">) {
  const { lang } = await params;
  redirect(href(isLang(lang) ? lang : DEFAULT_LANG, "/panier"));
}
