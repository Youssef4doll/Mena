import { formatTND, type Locale } from "./money";

/**
 * The texts sent to customers. Short, plain, in the customer's language.
 * Used by SMS, by the WhatsApp links the back office opens, and the e-mails.
 */
type OrderLike = { ref: string; name: string; total: number; locale: string };

const first = (name: string) => name.trim().split(/\s+/)[0] ?? "";
const loc = (o: OrderLike): Locale => (o.locale === "ar" ? "ar" : "fr");

export function placedText(o: OrderLike, shop: string, trackUrl: string) {
  return loc(o) === "ar"
    ? `${shop}: شكرا ${first(o.name)}، طلبيتك ${o.ref} (${formatTND(o.total, "ar")}) وصلت. باش نكلموك نأكدوها. التتبع: ${trackUrl}`
    : `${shop} : merci ${first(o.name)}, commande ${o.ref} reçue (${formatTND(o.total)}). Nous vous appelons pour la confirmer. Suivi : ${trackUrl}`;
}

export function confirmWhatsApp(o: OrderLike & { items: { name: string; qty: number }[]; city: string; governorate: string }, shop: string) {
  const lines = o.items.map((i) => `• ${i.qty} × ${i.name}`).join("\n");
  return loc(o) === "ar"
    ? `السلام ${first(o.name)}، معاك ${shop}.\nباش نأكدو طلبيتك ${o.ref}:\n${lines}\nالمجموع: ${formatTND(o.total, "ar")} تخلّصهم كي توصلك.\nالعنوان: ${o.city}، ${o.governorate}\nنأكدو؟`
    : `Bonjour ${first(o.name)}, c'est ${shop}.\nPour confirmer votre commande ${o.ref} :\n${lines}\nTotal : ${formatTND(o.total)}, à payer à la livraison.\nAdresse : ${o.city}, ${o.governorate}\nOn confirme ?`;
}

export function shippedText(o: OrderLike, shop: string, trackUrl: string, carrier?: string | null, tracking?: string | null) {
  const ct = [carrier, tracking].filter(Boolean).join(" ");
  return loc(o) === "ar"
    ? `${shop}: طلبيتك ${o.ref} خرجت${ct ? ` (${ct})` : ""}. حضّر ${formatTND(o.total, "ar")}. التتبع: ${trackUrl}`
    : `${shop} : votre commande ${o.ref} est en route${ct ? ` (${ct})` : ""}. Montant à préparer : ${formatTND(o.total)}. Suivi : ${trackUrl}`;
}

export function reviewText(o: OrderLike, shop: string, reviewUrl: string) {
  return loc(o) === "ar"
    ? `${shop}: نتمنّاو الطلبية ${o.ref} عجبتك. قلّنا رأيك في دقيقة: ${reviewUrl}`
    : `${shop} : nous espérons que votre commande ${o.ref} vous plaît. Votre avis en une minute : ${reviewUrl}`;
}

export function cartReminderText(args: { name: string | null; locale: Locale; shop: string; url: string; items: string[] }) {
  const n = args.name ? first(args.name) : "";
  const list = args.items.slice(0, 3).join(", ");
  return args.locale === "ar"
    ? `السلام${n ? ` ${n}` : ""}، معاك ${args.shop}. بديت طلبية: ${list}. تحب نكمّلوها مع بعضنا؟ ${args.url}`
    : `Bonjour${n ? ` ${n}` : ""}, c'est ${args.shop}. Vous avez commencé une commande : ${list}. On la termine ensemble ? ${args.url}`;
}

export function waLink(phone8: string, text: string) {
  return `https://wa.me/216${phone8}?text=${encodeURIComponent(text)}`;
}
