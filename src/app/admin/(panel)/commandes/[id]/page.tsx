import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { formatTND } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { STATUS_LABELS, TRANSITIONS, flagLabel } from "@/lib/order-status";
import { confirmWhatsApp, reviewText, waLink, shippedText } from "@/lib/messages";
import { trackingUrl } from "@/lib/orders";
import { refusalRate } from "@/lib/fraud";
import { Badge, Card, StatusBadge, btn } from "@/components/admin/ui";
import { CallPanel, StatusPanel, DetailsForm, BlacklistToggle } from "./OrderPanels";

export const metadata = { title: "Commande" };

const CALL_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmée",
  NO_ANSWER: "Pas de réponse",
  CALL_BACK: "À rappeler",
  WRONG_NUMBER: "Mauvais numéro",
  CANCELLED_BY_CUSTOMER: "Annulée par le client",
};

export default async function OrderPage({ params }: PageProps<"/admin/commandes/[id]">) {
  const { id } = await params;
  const o = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: { slug: true, supplierRef: true, supplierUrl: true, supplier: { select: { name: true, phone: true } }, images: { take: 1, orderBy: { sort: "asc" }, select: { mediaId: true } } } } } },
      history: { orderBy: { createdAt: "desc" } },
      calls: { orderBy: { createdAt: "desc" } },
      notifications: { orderBy: { createdAt: "desc" }, take: 10 },
      returns: { orderBy: { createdAt: "desc" } },
      customer: true,
    },
  });
  if (!o) notFound();
  const [settings, history] = await Promise.all([
    getSettings(),
    prisma.order.groupBy({ by: ["status"], where: { customerId: o.customerId, id: { not: o.id } }, _count: { _all: true } }),
  ]);
  const h = Object.fromEntries(history.map((x) => [x.status, x._count._all])) as Record<string, number>;
  const delivered = h.DELIVERED ?? 0;
  const refused = h.REFUSED ?? 0;
  const rate = refusalRate(delivered, refused);
  const shop = settings.shop.name;
  const confirmMsg = confirmWhatsApp({ ...o, items: o.items.map((i) => ({ name: `${i.name}${i.variantName ? ` (${i.variantName})` : ""}`, qty: i.qty })) }, shop);
  const track = trackingUrl(o);
  const margin = o.costTotal != null ? o.subtotal - o.discount - o.costTotal : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/commandes" className="text-sm text-muted">← Commandes</Link>
        <h1 className="font-mono text-2xl font-semibold">{o.ref}</h1>
        <StatusBadge status={o.status} />
        <span className="text-sm text-muted">{o.createdAt.toLocaleString("fr-FR")}</span>
      </div>
      {o.flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {o.flags.map((f) => {
            const l = flagLabel(f);
            return <Badge key={f} tone={l.tone}>{l.label}</Badge>;
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          {o.status === "PENDING" && (
            <Card title="Confirmation" hint="Appelez le client, ou envoyez-lui le message WhatsApp pré-rempli. Notez chaque tentative : le nombre d'appels est suivi.">
              <div className="mb-3 flex flex-wrap gap-2">
                <a href={`tel:+216${o.phone}`} className={btn.primary}>Appeler {formatPhone(o.phone)}</a>
                {o.phoneAlt && <a href={`tel:+216${o.phoneAlt}`} className={btn.ghost}>Appeler {formatPhone(o.phoneAlt)}</a>}
                <a href={waLink(o.phone, confirmMsg)} target="_blank" rel="noopener" className={btn.wa}>WhatsApp de confirmation</a>
              </div>
              <CallPanel orderId={o.id} />
            </Card>
          )}

          <Card title="Articles">
            <ul className="divide-y divide-line">
              {o.items.map((i) => (
                <li key={i.id} className="flex gap-3 py-3">
                  <span className="relative h-16 w-14 shrink-0 overflow-hidden rounded-lg bg-sand">
                    {i.product?.images[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/img/${i.product.images[0].mediaId}/128`} alt="" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">
                      {i.qty} × {i.name}
                      {i.variantName && <span className="text-muted"> · {i.variantName}</span>}
                    </span>
                    <span className="block text-xs text-muted">
                      {i.offerLabel ? <>Offre « {i.offerLabel} »</> : <>{formatTND(i.unitPrice)} l&apos;unité</>}
                      {i.unitCost != null && ` · coût ${formatTND(i.unitCost * i.qty)}`}
                    </span>
                    {i.product?.supplier && (
                      <span className="mt-1 block text-xs text-ink-2">
                        Fournisseur : {i.product.supplier.name}
                        {i.product.supplierRef && ` · réf. ${i.product.supplierRef}`}
                        {i.product.supplier.phone && ` · ${i.product.supplier.phone}`}
                        {i.product.supplierUrl && (
                          <>
                            {" · "}
                            <a href={i.product.supplierUrl} target="_blank" rel="noopener noreferrer" className="underline">lien</a>
                          </>
                        )}
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-medium tabular-nums">{formatTND(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-2 grid grid-cols-2 gap-y-1 border-t border-line pt-3 text-sm sm:max-w-sm sm:ms-auto">
              <dt className="text-muted">Sous-total</dt><dd className="text-end tabular-nums">{formatTND(o.subtotal)}</dd>
              {o.discount > 0 && (<><dt className="text-muted">Remise {o.promoCodeText && `(${o.promoCodeText})`}</dt><dd className="text-end tabular-nums">−{formatTND(o.discount)}</dd></>)}
              <dt className="text-muted">Livraison {o.governorate}</dt><dd className="text-end tabular-nums">{formatTND(o.deliveryFee)}</dd>
              <dt className="font-semibold">Total à encaisser</dt><dd className="text-end font-semibold tabular-nums">{formatTND(o.total)}</dd>
              {margin != null && (<><dt className="text-muted">Marge produits</dt><dd className="text-end tabular-nums text-olive">{formatTND(margin)}</dd></>)}
            </dl>
          </Card>

          <Card title="Statut">
            <StatusPanel orderId={o.id} next={TRANSITIONS[o.status].map((s) => ({ status: s, label: STATUS_LABELS[s] }))} carrier={o.carrier ?? settings.delivery.carrierName} tracking={o.trackingNumber ?? ""} />
            {o.status === "SHIPPED" && (
              <a href={waLink(o.phone, shippedText(o, shop, track, o.carrier, o.trackingNumber))} target="_blank" rel="noopener" className={`${btn.ghost} mt-3`}>
                Prévenir le client sur WhatsApp
              </a>
            )}
            {o.status === "DELIVERED" && (
              <a href={waLink(o.phone, reviewText(o, shop, `${track}?avis=1`))} target="_blank" rel="noopener" className={`${btn.ghost} mt-3`}>
                Demander un avis sur WhatsApp
              </a>
            )}
            {o.refusalReason && <p className="mt-3 text-sm text-clay">Motif du refus : {o.refusalReason}</p>}
          </Card>

          <Card title="Historique">
            <ol className="flex flex-col gap-2 text-sm">
              {[...o.history.map((e) => ({ at: e.createdAt, text: `${e.from ? `${STATUS_LABELS[e.from]} → ` : ""}${STATUS_LABELS[e.to]}`, by: e.by, note: e.note })),
                ...o.calls.map((c) => ({ at: c.createdAt, text: `Appel : ${CALL_LABELS[c.outcome]}`, by: c.by, note: c.note })),
                ...o.notifications.map((n) => ({ at: n.createdAt, text: `${n.channel} ${n.kind} — ${n.status === "SENT" ? "envoyé" : n.status === "NOT_CONFIGURED" ? "non envoyé (aucun fournisseur configuré)" : n.status === "FAILED" ? `échec ${n.error ?? ""}` : "en attente"}`, by: "système", note: null })),
              ]
                .sort((a, b) => b.at.getTime() - a.at.getTime())
                .map((e, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-32 shrink-0 text-xs text-muted">{e.at.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    <span>
                      {e.text} <span className="text-xs text-muted">· {e.by}</span>
                      {e.note && <span className="block text-xs text-ink-2">{e.note}</span>}
                    </span>
                  </li>
                ))}
            </ol>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Client">
            <p className="text-sm font-medium">{o.name}</p>
            <p className="text-sm tabular-nums">{formatPhone(o.phone)}{o.phoneAlt && ` · ${formatPhone(o.phoneAlt)}`}</p>
            <p className="mt-2 text-sm text-ink-2">{o.address}<br />{o.city}, {o.governorate}</p>
            {o.note && <p className="mt-2 rounded-lg bg-sand px-3 py-2 text-sm">Note : {o.note}</p>}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-cream p-2"><p className="text-lg font-semibold text-olive">{delivered}</p>livrées avant</div>
              <div className="rounded-lg bg-cream p-2"><p className="text-lg font-semibold text-clay">{refused}</p>refusées avant</div>
              <div className="rounded-lg bg-cream p-2"><p className="text-lg font-semibold">{rate == null ? "—" : `${Math.round(rate * 100)}%`}</p>taux de refus</div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link href={`/admin/clients/${o.customerId}`} className="text-sm underline">Fiche client</Link>
              <BlacklistToggle customerId={o.customerId} on={o.customer.blacklisted} reason={o.customer.blacklistReason ?? ""} />
            </div>
          </Card>
          <Card title="Modifier">
            <DetailsForm orderId={o.id} initial={{ name: o.name, phoneAlt: o.phoneAlt ?? "", city: o.city, address: o.address, note: o.note ?? "", carrier: o.carrier ?? "", trackingNumber: o.trackingNumber ?? "" }} />
          </Card>
          <Card title="Origine">
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted">Source</dt><dd>{o.source ?? "direct"}</dd>
              <dt className="text-muted">Medium</dt><dd>{o.medium ?? "—"}</dd>
              <dt className="text-muted">Campagne</dt><dd className="break-all">{o.campaign ?? "—"}</dd>
              <dt className="text-muted">Contenu</dt><dd className="break-all">{o.content ?? "—"}</dd>
              <dt className="text-muted">Page d&apos;entrée</dt><dd className="break-all">{o.landing ?? "—"}</dd>
              <dt className="text-muted">Appareil</dt><dd>{o.device ?? "—"}</dd>
              <dt className="text-muted">Langue</dt><dd>{o.locale}</dd>
              <dt className="text-muted">Paiement</dt><dd>{o.paymentMethod === "COD" ? "À la livraison" : "Carte"} · {o.paymentStatus}</dd>
              <dt className="text-muted">Délai annoncé</dt><dd>{o.deliveryQuote ?? "—"}</dd>
            </dl>
          </Card>
          {o.returns.length > 0 && (
            <Card title="Retours">
              {o.returns.map((r) => (
                <p key={r.id} className="text-sm">
                  {r.createdAt.toLocaleDateString("fr-FR")} · {r.reason} · <Link href="/admin/retours" className="underline">{r.status}</Link>
                </p>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
