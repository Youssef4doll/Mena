import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { getSettings } from "@/lib/settings";
import { formatTND } from "@/lib/money";
import { fmt } from "@/lib/viz";
import { adRows } from "@/lib/ads/data";
import { briefProducts } from "@/lib/ads/brief-data";
import { KPI_DEFS, kpis, totalRow } from "@/lib/ads/kpis";
import { levers, productBreakEvens, type BreakEven, type BreakEvenInput, type OfferBreakEven, type ShopEconomics } from "@/lib/ads/breakeven";
import { Badge, Card, Empty } from "@/components/admin/ui";
import { adRange, periodText } from "../_ui/range";
import { adsBasics } from "../_ui/server";
import { valueText } from "../_ui/format";

export const metadata = { title: "Seuils · Publicités" };

/**
 * "Seuils": how much the ads may cost per product and per offer before every
 * sale loses money, from the shop's own prices, costs and rates
 * (breakeven.ts does the sums). The ceilings use the shop's confirmation and
 * delivery over 180 days and, for clicks and impressions, the ad traffic's
 * measured rates over the period; whatever is missing is named, never zeroed.
 */

const money = (v: number | null | undefined) => (v == null ? "—" : formatTND(v));
const pct = (v: number | null | undefined) => fmt(v, "pct");
const times = (v: number | null | undefined) => valueText(v, "multiple");
/** A KPI's help after "Name :", in the run of the sentence; an acronym ("ROAS livré…") keeps its capitals. */
const lower = (s: string) => (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** What a missing input means for the owner, and where it is fixed. */
const MISSING: Record<BreakEvenInput, { text: string; href?: string }> = {
  unitCost: { text: "coût fournisseur du produit", href: "/admin/produits" },
  carrierCost: { text: "coût du transporteur par colis", href: "/admin/parametres" },
  returnCost: { text: "coût d'un colis qui revient", href: "/admin/parametres" },
  confirmRate: { text: "taux de confirmation (aucune commande appelée)" },
  deliveryRate: { text: "taux de livraison (aucun colis arrivé au bout)" },
  orderRate: { text: "taux de commande des visites publicitaires (aucune visite sur la période)" },
  landingRate: { text: "clics de la plateforme (export ou saisie des clics)", href: "/admin/publicites/importer" },
  ctr: { text: "impressions et clics de la plateforme", href: "/admin/publicites/importer" },
  cpa: { text: "CPA actuel (aucune dépense saisie sur la période)", href: "/admin/depenses" },
};

export default async function ThresholdsPage({ searchParams }: PageProps<"/admin/publicites/seuils">) {
  await requireAdmin();
  const r = adRange(await searchParams);
  const now = new Date();
  const [settings, { costs, baseline: base }, paid, order, products] = await Promise.all([
    getSettings(),
    adsBasics(r.to),
    adRows(r.from, r.to, "source", { paidOnly: true }),
    briefProducts(),
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        price: true,
        cost: true,
        active: true,
        offers: {
          where: { active: true, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          orderBy: { sort: "asc" },
          select: { id: true, label: true, quantity: true, price: true, freeDelivery: true },
        },
      },
      take: 500,
    }),
  ]);

  // The ad traffic's own rates, for the click and impression ceilings.
  const total = totalRow(paid);
  const k = kpis(total, costs, base);
  const shop: ShopEconomics = {
    deliveryFee: settings.delivery.fee,
    freeThreshold: settings.delivery.freeThreshold,
    carrierPerParcel: costs.carrierPerParcel,
    returnPerParcel: costs.returnPerParcel,
    confirmRate: base.confirmRate,
    deliveryRate: base.deliveryRate,
    orderRate: k.orderRate,
    landingRate: k.landingRate,
    ctr: k.ctr,
    cpa: k.cpaPlaced,
  };
  const rank = new Map(order.map((o, i) => [o.id, i]));
  const list = [...products]
    .sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9))
    .map((p) => ({ ...p, rows: distinct(productBreakEvens({ price: p.price, cost: p.cost, offers: p.offers }, shop)), orders: order[rank.get(p.id) ?? -1]?.orders ?? 0 }));

  const used: { label: string; value: string; note: string; missing?: BreakEvenInput }[] = [
    { label: "Frais de livraison facturés", value: money(settings.delivery.fee), note: settings.delivery.freeThreshold != null ? `offerts dès ${money(settings.delivery.freeThreshold)} d'achat` : "jamais offerts, sauf offre" },
    { label: "Transporteur par colis", value: money(costs.carrierPerParcel), note: "payé sur chaque colis envoyé", missing: costs.carrierPerParcel == null ? "carrierCost" : undefined },
    { label: "Retour d'un colis", value: money(costs.returnPerParcel), note: "en plus, sur un colis refusé", missing: costs.returnPerParcel == null ? "returnCost" : undefined },
    { label: "Confirmation", value: pct(base.confirmRate), note: `boutique, 180 jours, ${base.orders} commande${base.orders > 1 ? "s" : ""}`, missing: base.confirmRate == null ? "confirmRate" : undefined },
    { label: "Livraison", value: pct(base.deliveryRate), note: "colis livrés sur colis arrivés au bout, 180 jours", missing: base.deliveryRate == null ? "deliveryRate" : undefined },
    { label: "Taux de commande (pub)", value: pct(k.orderRate), note: `${fmt(total.funnel.orders, "int")} commande${total.funnel.orders > 1 ? "s" : ""} pour ${fmt(total.funnel.sessions, "int")} visite${total.funnel.sessions > 1 ? "s" : ""} pub, ${periodText(r)}`, missing: k.orderRate == null ? "orderRate" : undefined },
    { label: "Clics arrivés (pub)", value: pct(k.landingRate), note: "visites pour 100 clics de la plateforme", missing: k.landingRate == null ? "landingRate" : undefined },
    { label: "CTR lien (pub)", value: pct(k.ctr), note: "clics sur le lien pour 100 affichages", missing: k.ctr == null ? "ctr" : undefined },
    { label: "CPA actuel (pub)", value: money(k.cpaPlaced), note: `dépense divisée par les commandes, ${periodText(r)}`, missing: k.cpaPlaced == null ? "cpa" : undefined },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-ink-2">
        Ce que la publicité peut coûter, produit par produit et offre par offre, avant que chaque vente fasse perdre de l&apos;argent. Ce sont des plafonds à ne pas dépasser, pas des objectifs : visez nettement en dessous.
      </p>

      <Card title="Chiffres utilisés" hint="Les plafonds se recalculent avec ces chiffres. Les taux de la boutique sont mesurés, les plafonds qui en sortent sont des estimations.">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 xl:grid-cols-5">
          {used.map((u) => (
            <div key={u.label} className="min-w-0">
              <dt className="text-xs text-muted">{u.label}</dt>
              <dd className="text-[17px] font-semibold tabular-nums text-ink">{u.value}</dd>
              <dd className="text-xs text-muted">
                {u.missing ? <MissingNote input={u.missing} /> : u.note}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="Ce que veulent dire les plafonds">
        <ul className="grid gap-x-6 gap-y-1.5 text-[13px] text-ink-2 sm:grid-cols-2">
          <li><strong className="text-ink">Coût max par livrée</strong> : {lower(KPI_DEFS.breakEvenCpd.help)}</li>
          <li><strong className="text-ink">CPA max</strong> : {lower(KPI_DEFS.breakEvenCpa.help)} Le CPA est le coût publicitaire d&apos;une commande passée.</li>
          <li><strong className="text-ink">CPC max</strong> : ce qu&apos;un clic sur le lien peut coûter, au taux de commande et aux clics arrivés mesurés.</li>
          <li><strong className="text-ink">CPM max</strong> : ce que 1 000 affichages peuvent coûter, au CTR lien mesuré.</li>
          <li><strong className="text-ink">ROAS minimum</strong> : {KPI_DEFS.breakEvenRoas.help} Le ROAS est le chiffre d&apos;affaires livré pour 1 DT de publicité.</li>
          <li><strong className="text-ink">Livraison minimale</strong> : au CPA actuel, le taux de livraison sous lequel le produit perd de l&apos;argent.</li>
        </ul>
      </Card>

      {list.length === 0 ? (
        <Empty>Aucun produit. Ajoutez un produit pour voir ses plafonds.</Empty>
      ) : (
        <section className="flex flex-col gap-2" aria-label="Plafonds par produit">
          {list.map((p) => (
            <ProductThresholds key={p.id} id={p.id} name={p.name} active={p.active} orders={p.orders} rows={p.rows} shop={shop} />
          ))}
        </section>
      )}
    </div>
  );
}

/** An offer of one unit at the unit price, delivery not offered, is the single unit again: shown once. */
function distinct(rows: OfferBreakEven[]): OfferBreakEven[] {
  const unit = rows[0];
  return rows.filter((r, i) => i === 0 || !(r.units === 1 && r.input.price === unit.input.price && r.input.deliveryFee === unit.input.deliveryFee));
}

function MissingNote({ input }: { input: BreakEvenInput }) {
  const m = MISSING[input];
  return (
    <span className="text-[#8a5a00]">
      Il manque : {m.href ? <Link href={m.href} className="underline">{m.text}</Link> : m.text}
    </span>
  );
}

/** Inputs without which no ceiling exists; the others only leave the click and impression ceilings empty. */
const BLOCKING = new Set<BreakEvenInput>(["unitCost", "carrierCost", "returnCost", "confirmRate", "deliveryRate"]);

/** One product: the single unit's ceilings in the summary, every offer side by side once opened. */
function ProductThresholds({ id, name, active, orders, rows, shop }: { id: string; name: string; active: boolean; orders: number; rows: OfferBreakEven[]; shop: ShopEconomics }) {
  const unit = rows[0];
  const u = unit.result;
  const best = rows.reduce((b, x) => ((x.result.maxCpa ?? -1) > (b.result.maxCpa ?? -1) ? x : b), unit);
  const packRoom = best !== unit && best.result.maxCpa != null && u.maxCpa != null && best.result.maxCpa > u.maxCpa;
  const missing = [...new Set(rows.flatMap((x) => x.result.missing))];
  const blocking = missing.filter((m) => BLOCKING.has(m));
  const optional = missing.filter((m) => !BLOCKING.has(m));
  const lv = u.maxCpa != null ? levers(unit.input) : [];

  return (
    <details className="group min-w-0 rounded-2xl border border-line bg-white">
      <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-ink">{name}</span>
            {!active && <Badge>Hors ligne</Badge>}
            {u.margin != null && u.margin <= 0 && <Badge tone="danger">Perd de l&apos;argent même sans pub</Badge>}
            {u.productCost == null && <Badge tone="warn">Coût fournisseur manquant</Badge>}
            {packRoom && <Badge tone="ok">Plus de marge en pack</Badge>}
          </span>
          <span className="text-xs text-muted">
            1 article : {money(u.revenue)} encaissés · {orders} commande{orders > 1 ? "s" : ""} en 90 jours
          </span>
        </span>
        <span aria-hidden className="text-muted transition-transform group-open:rotate-180 sm:order-last">▾</span>
        <dl className="col-span-2 grid grid-cols-3 gap-x-3 tabular-nums sm:col-span-1 sm:w-[340px] sm:text-end">
          {[
            ["Coût max par livrée", money(u.maxCostPerDelivered)],
            ["CPA max", money(u.maxCpa)],
            ["ROAS minimum", times(u.minRoas)],
          ].map(([t, v]) => (
            <div key={t} className="flex flex-col justify-end">
              <dt className="text-[11px] leading-tight text-muted">{t}</dt>
              <dd className="text-sm font-semibold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </summary>

      <div className="flex flex-col gap-4 border-t border-line p-4">
        <OfferTable rows={rows} />

        {blocking.length > 0 && (
          <p className="text-sm text-[#8a5a00]">
            Plafonds incomplets. Il manque :{" "}
            {blocking.map((m, i) => (
              <span key={m}>
                {i > 0 && ", "}
                {m === "unitCost" ? <Link href={`/admin/produits/${id}`} className="underline">{MISSING[m].text}</Link> : MISSING[m].href ? <Link href={MISSING[m].href!} className="underline">{MISSING[m].text}</Link> : MISSING[m].text}
              </span>
            ))}
            .
          </p>
        )}
        {blocking.length === 0 && <PlatformGap missing={optional} />}

        <MinRates result={u} shop={shop} />

        {lv.length > 0 && (
          <div>
            <h3 className="text-[13px] font-semibold text-ink">Pour avoir plus de marge (1 article)</h3>
            <p className="mb-2 text-xs text-muted">Chaque levier seul, le reste inchangé : ce qu&apos;il ajoute au CPA max.</p>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {lv.map((l) => (
                <li key={l.key} className="rounded-xl border border-line px-3 py-2 text-sm">
                  <span className="block text-ink-2">{l.label}</span>
                  <span className="font-semibold tabular-nums text-ink">CPA max {money(l.maxCpa)}</span>
                  {l.gain != null && l.gain > 0 && <span className="ms-1.5 text-xs text-olive tabular-nums">+{formatTND(l.gain)}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

const TABLE_ROWS: { key: keyof BreakEven; label: string; help?: string; show: (b: BreakEven) => string }[] = [
  { key: "revenue", label: "Encaissé par livrée", help: "Prix et frais de livraison payés par le client.", show: (b) => money(b.revenue) },
  { key: "productCost", label: "Coût des produits", show: (b) => money(b.productCost) },
  { key: "shippingPerDelivered", label: "Transport par livrée", help: "Transporteur et retours, colis refusés compris.", show: (b) => money(b.shippingPerDelivered) },
  { key: "margin", label: "Marge par livrée", help: "Ce qui reste avant la publicité.", show: (b) => money(b.margin) },
  { key: "maxCostPerDelivered", label: "Coût max par livrée", show: (b) => money(b.maxCostPerDelivered) },
  { key: "maxCpa", label: "CPA max", help: "Par commande passée, annulations et refus comptés.", show: (b) => money(b.maxCpa) },
  { key: "maxCostPerVisit", label: "Coût max par visite", show: (b) => money(b.maxCostPerVisit) },
  { key: "maxCpc", label: "CPC max", show: (b) => money(b.maxCpc) },
  { key: "maxCpm", label: "CPM max", help: "Pour 1 000 affichages.", show: (b) => money(b.maxCpm) },
  { key: "minRoas", label: "ROAS minimum", show: (b) => times(b.minRoas) },
];

/** Offers as columns, figures as rows: a product rarely has more than 3 offers, so it fits a phone. */
function OfferTable({ rows }: { rows: OfferBreakEven[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[420px] text-[13px]">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th className="py-2 pe-3 text-start font-medium">Par commande livrée</th>
            {rows.map((x) => (
              <th key={x.key} className="min-w-28 px-2 py-2 text-end font-medium">
                <span className="block text-ink">{x.label}</span>
                <span className="block font-normal">
                  {/* The single unit is already called "1 article": its price alone. */}
                  {x.label === `${x.units} article` ? "" : `${x.units} article${x.units > 1 ? "s" : ""} · `}
                  {money(x.input.price)}
                  {x.input.deliveryFee === 0 ? " · livraison offerte" : ""}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line tabular-nums">
          {TABLE_ROWS.map((t) => (
            <tr key={t.key} className={t.key === "maxCostPerDelivered" || t.key === "maxCpa" ? "font-semibold text-ink" : ""}>
              <th scope="row" className="min-w-32 py-2 pe-3 text-start font-normal text-ink-2">
                {t.label}
                {t.help && <span className="block text-[11px] text-muted">{t.help}</span>}
              </th>
              {rows.map((x) => (
                <td key={x.key} className={`whitespace-nowrap px-2 py-2 text-end ${t.key === "margin" && x.result.margin != null && x.result.margin <= 0 ? "text-clay" : ""}`}>
                  {t.show(x.result)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Why the visit, click and impression ceilings are empty, in one sentence: the first missing measure explains the rest. */
function PlatformGap({ missing }: { missing: BreakEvenInput[] }) {
  const has = (m: BreakEvenInput) => missing.includes(m);
  const importLink = <Link href="/admin/publicites/importer" className="underline">Importer un export</Link>;
  if (has("orderRate")) return <p className="text-xs text-muted">Coût max par visite, CPC et CPM vides : aucune visite venue d&apos;une publicité sur la période.</p>;
  if (has("landingRate")) return <p className="text-xs text-muted">CPC et CPM max vides : il manque les clics sur le lien de la plateforme. {importLink}</p>;
  if (has("ctr")) return <p className="text-xs text-muted">CPM max vide : il manque les impressions de la plateforme. {importLink}</p>;
  return null;
}

/** At today's CPA: the delivery and confirmation rates the single unit needs, next to the shop's. */
function MinRates({ result, shop }: { result: BreakEven; shop: ShopEconomics }) {
  if (shop.cpa == null) {
    return (
      <p className="text-xs text-muted">
        Livraison et confirmation minimales : il faut le CPA actuel. <Link href="/admin/depenses" className="underline">Saisissez la dépense</Link> ou <Link href="/admin/publicites/importer" className="underline">importez un export</Link>.
      </p>
    );
  }
  const line = (label: string, min: number | null, current: number | null) => {
    if (min == null) return <li>{label} : — (coûts ou taux manquants)</li>;
    if (min > 1) return <li className="text-clay">{label} : impossible, même à 100 % ce produit perd de l&apos;argent à ce CPA.</li>;
    const short = current != null && current < min;
    return (
      <li className={short ? "text-clay" : ""}>
        {label} : au moins <strong className="tabular-nums">{pct(min)}</strong>
        {current != null && <span className="text-muted"> (boutique : {pct(current)})</span>}
      </li>
    );
  };
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-ink">Au CPA actuel de {money(shop.cpa)} (1 article)</h3>
      <ul className="mt-1 flex flex-col gap-0.5 text-sm text-ink-2">
        {line("Livraison", result.minDeliveryRate, shop.deliveryRate ?? null)}
        {line("Confirmation", result.minConfirmRate, shop.confirmRate ?? null)}
      </ul>
    </div>
  );
}
