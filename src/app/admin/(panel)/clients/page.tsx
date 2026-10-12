import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatTND } from "@/lib/money";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { Badge, Empty, PageTitle, Tabs, btn, input } from "@/components/admin/ui";

export const metadata = { title: "Clients" };

type Row = { id: string; phone: string; name: string | null; blacklisted: boolean; orders: number; delivered: number; refused: number; spent: number; last: Date | null };

export default async function CustomersPage({ searchParams }: PageProps<"/admin/clients">) {
  const sp = await searchParams;
  const f = typeof sp.f === "string" ? sp.f : "all";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const phone = q ? normalizePhone(q) : null;
  const like = `%${q}%`;
  // One aggregate in SQL rather than counting orders in JavaScript.
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT c.id, c.phone, c.name, c.blacklisted,
      COUNT(o.id)::int AS orders,
      COUNT(o.id) FILTER (WHERE o.status = 'DELIVERED')::int AS delivered,
      COUNT(o.id) FILTER (WHERE o.status = 'REFUSED')::int AS refused,
      COALESCE(SUM(o.total) FILTER (WHERE o.status = 'DELIVERED'), 0)::int AS spent,
      MAX(o."createdAt") AS last
    FROM "Customer" c LEFT JOIN "Order" o ON o."customerId" = c.id
    WHERE (${q} = '' OR c.name ILIKE ${like} OR c.phone = ${phone ?? "—"} OR c.phone LIKE ${like})
      AND (${f} <> 'blacklist' OR c.blacklisted)
    GROUP BY c.id
    HAVING (${f} <> 'repeat' OR COUNT(o.id) FILTER (WHERE o.status = 'DELIVERED') >= 2)
       AND (${f} <> 'refusers' OR COUNT(o.id) FILTER (WHERE o.status = 'REFUSED') >= 1)
    ORDER BY MAX(o."createdAt") DESC NULLS LAST
    LIMIT 300`;
  void Prisma;

  return (
    <>
      <PageTitle title="Clients" sub="Un client = un numéro de téléphone." actions={<a href="/admin/analytics/export?report=customers" className={btn.ghost}>Exporter CSV</a>} />
      <Tabs current={f} items={[
        { key: "all", label: "Tous", href: "/admin/clients" },
        { key: "repeat", label: "Fidèles (2+ livrées)", href: "/admin/clients?f=repeat" },
        { key: "refusers", label: "Ont refusé", href: "/admin/clients?f=refusers" },
        { key: "blacklist", label: "Liste noire", href: "/admin/clients?f=blacklist" },
      ]} />
      <form className="mb-4 flex gap-2" action="/admin/clients">
        <input type="hidden" name="f" value={f} />
        <input name="q" defaultValue={q} placeholder="Nom ou téléphone" className={input} />
        <button className={btn.primary}>Chercher</button>
      </form>
      {rows.length === 0 ? <Empty>Aucun client.</Empty> : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {rows.map((c) => {
            const rate = c.delivered + c.refused > 0 ? c.refused / (c.delivered + c.refused) : null;
            return (
              <li key={c.id}>
                <Link href={`/admin/clients/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-cream">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{c.name ?? "—"} · <span className="tabular-nums">{formatPhone(c.phone)}</span></span>
                    <span className="text-xs text-muted">{c.orders} commande(s) · {c.delivered} livrée(s) · {c.refused} refusée(s){c.last && ` · dernière ${new Date(c.last).toLocaleDateString("fr-FR")}`}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    {c.blacklisted && <Badge tone="danger">Liste noire</Badge>}
                    {rate != null && rate >= 0.5 && c.refused >= 2 && <Badge tone="danger">Refus {Math.round(rate * 100)} %</Badge>}
                    {c.delivered >= 2 && <Badge tone="ok">Fidèle</Badge>}
                    <span className="text-sm font-semibold tabular-nums">{formatTND(c.spent)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
