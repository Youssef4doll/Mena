import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatTND, toInputTND } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { waLink } from "@/lib/messages";
import { Empty, PageTitle, Tabs, btn, input, label } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/FormBits";
import { updateReturn } from "../simple-actions";

export const metadata = { title: "Retours" };

const LABELS: Record<string, string> = { REQUESTED: "Demandé", ACCEPTED: "Accepté", REJECTED: "Refusé", RECEIVED: "Reçu", REFUNDED: "Remboursé" };

export default async function ReturnsPage({ searchParams }: PageProps<"/admin/retours">) {
  const sp = await searchParams;
  const status = Object.keys(LABELS).find((s) => s === sp.s) ?? "REQUESTED";
  const [list, counts] = await Promise.all([
    prisma.returnRequest.findMany({
      where: { status: status as "REQUESTED" },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { order: { select: { id: true, ref: true, name: true, phone: true, total: true, deliveredAt: true, items: { select: { name: true, qty: true, variantName: true } } } } },
    }),
    prisma.returnRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const c = Object.fromEntries(counts.map((x) => [x.status, x._count._all]));
  return (
    <>
      <PageTitle title="Retours" sub="Demandes faites par les clients depuis leur page de suivi. Un retour « Reçu » passe la commande en « Retournée »." />
      <Tabs current={status} items={Object.entries(LABELS).map(([k, v]) => ({ key: k, label: v, href: `/admin/retours?s=${k}`, count: c[k] ?? 0 }))} />
      {list.length === 0 ? <Empty>Aucune demande.</Empty> : (
        <ul className="flex flex-col gap-3">
          {list.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/admin/commandes/${r.order.id}`} className="font-mono font-semibold">{r.order.ref}</Link>
                <span className="text-xs text-muted">demandé le {r.createdAt.toLocaleDateString("fr-FR")}{r.order.deliveredAt && ` · livré le ${r.order.deliveredAt.toLocaleDateString("fr-FR")}`}</span>
              </div>
              <p className="mt-1 text-sm">{r.order.name} · {formatPhone(r.order.phone)} · {formatTND(r.order.total)}</p>
              <p className="text-xs text-muted">{r.order.items.map((i) => `${i.qty} × ${i.name}${i.variantName ? ` (${i.variantName})` : ""}`).join(", ")}</p>
              <p className="mt-2 rounded-lg bg-sand px-3 py-2 text-sm"><strong>{r.reason}</strong>{r.details && ` — ${r.details}`}</p>
              <a href={waLink(r.order.phone, `Bonjour ${r.order.name.split(" ")[0]}, au sujet de votre demande de retour pour la commande ${r.order.ref} :`)} target="_blank" rel="noopener" className={`${btn.wa} mt-3`}>Répondre sur WhatsApp</a>
              <ActionForm action={updateReturn} className="mt-3">
                <input type="hidden" name="id" value={r.id} />
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className={label}>Statut<select name="status" defaultValue={r.status} className={input}>{Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  <label className={label}>Remboursé (DT)<input name="refundAmount" defaultValue={toInputTND(r.refundAmount)} className={input} /></label>
                  <label className={label}>Note interne<input name="adminNote" defaultValue={r.adminNote ?? ""} className={input} /></label>
                </div>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
