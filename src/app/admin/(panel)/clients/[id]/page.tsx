import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatTND } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { waLink } from "@/lib/messages";
import { Card, StatusBadge, Stat, btn } from "@/components/admin/ui";
import { BlacklistToggle } from "../../commandes/[id]/OrderPanels";

export const metadata = { title: "Client" };

export default async function CustomerPage({ params }: PageProps<"/admin/clients/[id]">) {
  const { id } = await params;
  const c = await prisma.customer.findUnique({ where: { id }, include: { orders: { orderBy: { createdAt: "desc" }, include: { items: { select: { qty: true, name: true } } } } } });
  if (!c) notFound();
  const delivered = c.orders.filter((o) => o.status === "DELIVERED");
  const refused = c.orders.filter((o) => o.status === "REFUSED").length;
  const spent = delivered.reduce((s, o) => s + o.total, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/clients" className="text-sm text-muted">← Clients</Link>
        <h1 className="font-display text-[26px]">{c.name ?? formatPhone(c.phone)}</h1>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Commandes" value={String(c.orders.length)} />
        <Stat label="Livrées" value={String(delivered.length)} tone="ok" />
        <Stat label="Refusées" value={String(refused)} tone={refused ? "danger" : undefined} />
        <Stat label="Dépensé (livré)" value={formatTND(spent)} />
      </div>
      <Card title="Contact">
        <p className="text-sm tabular-nums">{formatPhone(c.phone)}{c.email && ` · ${c.email}`}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`tel:+216${c.phone}`} className={btn.primary}>Appeler</a>
          <a href={waLink(c.phone, `Bonjour ${c.name?.split(" ")[0] ?? ""},`)} target="_blank" rel="noopener" className={btn.wa}>WhatsApp</a>
          <BlacklistToggle customerId={c.id} on={c.blacklisted} reason={c.blacklistReason ?? ""} />
        </div>
        {c.blacklisted && c.blacklistReason && <p className="mt-2 text-sm text-clay">Motif : {c.blacklistReason}</p>}
      </Card>
      <Card title="Commandes">
        <ul className="divide-y divide-line">
          {c.orders.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/commandes/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span><span className="font-mono font-semibold">{o.ref}</span> · {o.createdAt.toLocaleDateString("fr-FR")} · {o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</span>
                <span className="flex items-center gap-2"><span className="tabular-nums">{formatTND(o.total)}</span><StatusBadge status={o.status} /></span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
