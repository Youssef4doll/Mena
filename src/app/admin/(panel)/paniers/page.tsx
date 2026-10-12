import { abandonedCarts } from "@/lib/abandoned";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { formatTND } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { cartReminderText, waLink } from "@/lib/messages";
import { SITE_URL } from "@/lib/site";
import { Badge, Empty, PageTitle, Stat } from "@/components/admin/ui";
import { RemindButtons } from "./RemindButtons";

export const metadata = { title: "Paniers abandonnés" };

export default async function CartsPage() {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [list, settings, recovered, reminded] = await Promise.all([
    abandonedCarts(),
    getSettings(),
    // A reminded cart that later turned into an order.
    prisma.cart.count({ where: { status: "CONVERTED", remindedAt: { not: null }, updatedAt: { gte: since } } }),
    prisma.cart.count({ where: { remindedAt: { gte: since } } }),
  ]);
  const value = list.reduce((s, c) => s + c.value, 0);
  const reachable = list.filter((c) => c.cart.phone);
  const smsReady = Boolean(settings.notify.smsUrl);

  return (
    <>
      <PageTitle title="Paniers abandonnés" sub="Paniers sans commande depuis plus d'une heure, 30 derniers jours. Valeur aux prix actuels. Un numéro est connu quand le client l'a tapé dans le formulaire de commande." />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Paniers abandonnés" value={String(list.length)} />
        <Stat label="Valeur en jeu" value={formatTND(value)} tone={value ? "warn" : undefined} />
        <Stat label="Avec numéro" value={`${reachable.length}`} sub="relançables" />
        <Stat label="Relancés → commandés" value={`${recovered}/${reminded}`} sub="30 jours" tone="ok" />
      </div>
      {list.length === 0 ? <Empty>Aucun panier abandonné.</Empty> : (
        <ul className="flex flex-col gap-2">
          {list.map(({ cart, value: v, items }) => {
            const url = `${SITE_URL}/panier/${cart.id}`;
            const text = cartReminderText({ name: cart.name, locale: "fr", shop: settings.shop.name, url, items: items.map((i) => i.name) });
            return (
              <li key={cart.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {cart.phone ? <>{cart.name ?? "—"} · <span className="tabular-nums">{formatPhone(cart.phone)}</span></> : <span className="text-muted">Numéro inconnu</span>}
                    {cart.governorate && <span className="text-muted"> · {cart.governorate}</span>}
                  </span>
                  <span className="block truncate text-xs text-muted">{items.map((i) => `${i.qty}× ${i.name}${i.variant ? ` (${i.variant})` : ""}`).join(", ")}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <Badge>{cart.updatedAt.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</Badge>
                    {cart.source && <Badge>{cart.source}{cart.campaign ? ` · ${cart.campaign}` : ""}</Badge>}
                    {cart.remindCount > 0 && <Badge tone="info">Relancé {cart.remindCount}×</Badge>}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{formatTND(v)}</span>
                {cart.phone && <RemindButtons cartId={cart.id} wa={waLink(cart.phone, text)} text={text} sms={smsReady} />}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
