import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatTND } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { STATUS_LABELS, flagLabel } from "@/lib/order-status";
import { orderWhere, STATUS_TABS, statusCounts } from "@/lib/admin-orders";
import { isRisky } from "@/lib/fraud";
import { Badge, Empty, PageTitle, StatusBadge, Tabs, btn, input } from "@/components/admin/ui";

export const metadata = { title: "Commandes" };
const PER_PAGE = 50;

export default async function OrdersPage({ searchParams }: PageProps<"/admin/commandes">) {
  const sp = await searchParams;
  const status = typeof sp.statut === "string" ? sp.statut : "PENDING";
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const where = orderWhere(status, q);
  const [orders, total, counts] = await Promise.all([
    prisma.order.findMany({
      where,
      // Oldest first while waiting for a call: nobody should wait longest.
      orderBy: status === "PENDING" ? { createdAt: "asc" } : { createdAt: "desc" },
      take: PER_PAGE,
      skip: (page - 1) * PER_PAGE,
      select: {
        id: true, ref: true, status: true, name: true, phone: true, governorate: true, city: true, address: true, total: true, flags: true, source: true,
        confirmAttempts: true, createdAt: true, items: { select: { qty: true } },
      },
    }),
    prisma.order.count({ where }),
    statusCounts(),
  ]);
  const qs = (o: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ statut: status, q, ...o })) if (v !== undefined && v !== "") p.set(k, String(v));
    return `/admin/commandes?${p}`;
  };
  // Risky orders first inside the confirmation queue.
  const sorted = status === "PENDING" ? [...orders].sort((a, b) => Number(isRisky(b.flags)) - Number(isRisky(a.flags))) : orders;

  return (
    <>
      <PageTitle
        title="Commandes"
        sub={status === "PENDING" ? "À appeler, de la plus ancienne à la plus récente. Les commandes à risque sont en tête." : undefined}
        actions={<a href={`/admin/commandes/export?statut=${status}&q=${encodeURIComponent(q)}`} className={btn.ghost}>Exporter CSV</a>}
      />
      <Tabs
        current={status}
        items={STATUS_TABS.map((s) => ({ key: s, label: s === "ALL" ? "Toutes" : STATUS_LABELS[s], href: qs({ statut: s, page: undefined }), count: counts[s] ?? 0 }))}
      />
      <form className="mb-4 flex gap-2" action="/admin/commandes">
        <input type="hidden" name="statut" value={status} />
        <input name="q" defaultValue={q} placeholder="Réf., nom, téléphone, adresse, ville" className={input} />
        <button className={btn.primary}>Chercher</button>
      </form>

      {sorted.length === 0 ? (
        <Empty>{status === "PENDING" ? "Aucune commande à confirmer." : "Aucune commande."}</Empty>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <ul className="divide-y divide-line">
            {sorted.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/commandes/${o.id}`} className="grid gap-x-4 gap-y-1 px-4 py-3 hover:bg-cream sm:grid-cols-[130px_1fr_140px_120px] sm:items-center">
                  <span className="flex items-center justify-between gap-2 sm:block">
                    <span className="font-mono text-[13px] font-semibold">{o.ref}</span>
                    <span className="block text-xs text-muted">
                      {o.createdAt.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {o.name} · <span className="tabular-nums text-ink-2">{formatPhone(o.phone)}</span>
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {[o.address, o.city, o.governorate].filter(Boolean).join(", ")} · {o.items.reduce((n, i) => n + i.qty, 0)} art. · {o.source ?? "direct"}
                      {o.confirmAttempts > 0 && ` · ${o.confirmAttempts} appel(s)`}
                    </span>
                    {o.flags.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {o.flags.map((f) => {
                          const l = flagLabel(f);
                          return <Badge key={f} tone={l.tone}>{l.label}</Badge>;
                        })}
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-semibold tabular-nums sm:text-end">{formatTND(o.total)}</span>
                  <span className="sm:text-end">
                    <StatusBadge status={o.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {total > PER_PAGE && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">
            {(page - 1) * PER_PAGE + 1}–{Math.min(total, page * PER_PAGE)} sur {total}
          </span>
          <span className="flex gap-2">
            {page > 1 && <Link className={btn.ghost} href={qs({ page: page - 1 })}>Précédent</Link>}
            {page * PER_PAGE < total && <Link className={btn.ghost} href={qs({ page: page + 1 })}>Suivant</Link>}
          </span>
        </div>
      )}
    </>
  );
}
