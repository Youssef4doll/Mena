import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatTND } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { minutesAgo, tunisMidnight } from "@/lib/analytics-range";
import { flagLabel } from "@/lib/order-status";
import { isRisky } from "@/lib/fraud";
import { abandonedCarts } from "@/lib/abandoned";
import { Badge, Card, PageTitle, Stat, btn } from "@/components/admin/ui";

export const metadata = { title: "Tableau de bord" };

export default async function Dashboard() {
  const today = tunisMidnight(new Date());
  const since5 = minutesAgo(5);
  const [todayAgg, toConfirm, counts, live, lowStock, carts, demo] = await Promise.all([
    prisma.order.aggregate({ where: { createdAt: { gte: today }, status: { not: "CANCELLED" } }, _count: { _all: true }, _sum: { total: true } }),
    prisma.order.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 8, select: { id: true, ref: true, name: true, phone: true, total: true, governorate: true, flags: true, createdAt: true, confirmAttempts: true } }),
    prisma.order.groupBy({ by: ["status"], where: { status: { in: ["PENDING", "CONFIRMED", "SUPPLIER_ORDERED", "SHIPPED"] } }, _count: { _all: true } }),
    prisma.analyticsEvent.findMany({ where: { createdAt: { gte: since5 } }, distinct: ["visitorId"], select: { visitorId: true } }),
    prisma.product.findMany({
      where: { active: true, OR: [{ stockMode: "TRACKED", stockQty: { lte: 5 }, variants: { none: {} } }, { stockMode: "SUPPLIER", available: false }] },
      take: 8,
      select: { id: true, name: true, stockMode: true, stockQty: true },
    }),
    abandonedCarts(2, 100),
    prisma.product.count({ where: { isDemo: true } }),
  ]);
  const c = Object.fromEntries(counts.map((x) => [x.status, x._count._all])) as Record<string, number>;
  const reachable = carts.filter((x) => x.cart.phone);
  const queue = [...toConfirm].sort((a, b) => Number(isRisky(b.flags)) - Number(isRisky(a.flags)));

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Tableau de bord" sub="Ce qui demande une action aujourd'hui." actions={<Link href="/admin/analytics" className={btn.ghost}>Analytics</Link>} />
      {demo > 0 && (
        <p className="rounded-2xl border border-[#e8d49a] bg-[#fff8e6] px-4 py-3 text-sm">
          La boutique affiche {demo} produits de démonstration. <Link href="/admin/produits" className="underline">Ajoutez vos produits puis supprimez la démo</Link>.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Commandes aujourd'hui" value={String(todayAgg._count._all)} sub={formatTND(todayAgg._sum.total ?? 0)} />
        <Stat label="À confirmer" value={String(c.PENDING ?? 0)} tone={(c.PENDING ?? 0) > 0 ? "warn" : undefined} />
        <Stat label="À préparer / commander" value={String((c.CONFIRMED ?? 0) + (c.SUPPLIER_ORDERED ?? 0))} />
        <Stat label="En livraison" value={String(c.SHIPPED ?? 0)} sub={`${live.length} visiteur(s) en ce moment`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="À appeler en premier" aside={<Link href="/admin/commandes" className="text-sm text-sea underline">Tout voir</Link>}>
          {queue.length === 0 ? <p className="text-sm text-muted">Aucune commande en attente.</p> : (
            <ul className="divide-y divide-line">
              {queue.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/commandes/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{o.name} · <span className="tabular-nums">{formatPhone(o.phone)}</span></span>
                      <span className="text-xs text-muted">
                        <span className="font-mono">{o.ref}</span> · {o.governorate} · {o.createdAt.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        {o.confirmAttempts > 0 && ` · ${o.confirmAttempts} appel(s)`}
                      </span>
                      {o.flags.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{o.flags.map((f) => { const l = flagLabel(f); return <Badge key={f} tone={l.tone}>{l.label}</Badge>; })}</span>}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{formatTND(o.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Commandes non terminées (48 h)" aside={<Link href="/admin/paniers" className="text-sm text-sea underline">Relancer</Link>}>
            <p className="text-sm">{reachable.length} formulaire(s) avec numéro · {formatTND(reachable.reduce((s, x) => s + x.value, 0))}</p>
          </Card>
          <Card title="Stock à surveiller">
            {lowStock.length === 0 ? <p className="text-sm text-muted">Rien à signaler.</p> : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {lowStock.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <Link href={`/admin/produits/${p.id}`} className="truncate hover:underline">{p.name}</Link>
                    {p.stockMode === "SUPPLIER" ? <Badge tone="danger">Indispo fournisseur</Badge> : <Badge tone={p.stockQty === 0 ? "danger" : "warn"}>{p.stockQty} en stock</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
