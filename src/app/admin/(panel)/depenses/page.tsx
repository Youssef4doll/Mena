import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatTND } from "@/lib/money";
import { tunisDay } from "@/lib/analytics-range";
import { Card, Empty, PageTitle, input, label } from "@/components/admin/ui";
import { ActionForm, ConfirmButton } from "@/components/admin/FormBits";
import { saveAdSpend, deleteAdSpend } from "../simple-actions";

export const metadata = { title: "Dépenses pub" };

/** The sources orders already carry, so a spend lines up with its orders. */
const SOURCES = ["facebook", "instagram", "tiktok", "google", "snapchat"];

/**
 * Ad spend copied from Meta, TikTok or Google's managers. With it, the
 * analytics give the cost of one delivered order and the profit after ads.
 */
export default async function AdSpendPage() {
  const [rows, used] = await Promise.all([
    prisma.adSpend.findMany({ orderBy: [{ day: "desc" }, { createdAt: "desc" }], take: 60 }),
    prisma.order.groupBy({ by: ["source"], where: { source: { notIn: ["direct"] } }, _count: { _all: true }, orderBy: { _count: { source: "desc" } }, take: 10 }),
  ]);
  const sources = [...new Set([...SOURCES, ...used.map((u) => u.source).filter((s): s is string => Boolean(s))])];
  const today = tunisDay(new Date());
  return (
    <>
      <PageTitle
        title="Dépenses pub"
        sub={
          <>
            Recopiez ici ce que le gestionnaire de publicités indique, par jour ou par semaine. Les <Link href="/admin/analytics" className="underline">Analytics</Link> en tirent le coût par commande livrée et le bénéfice après publicité.
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card title="Ajouter une dépense">
          <ActionForm action={saveAdSpend}>
            <div className="grid grid-cols-2 gap-2">
              <label className={label}>Du<input type="date" name="from" defaultValue={today} className={input} required /></label>
              <label className={label}>Au (inclus)<input type="date" name="to" defaultValue={today} className={input} /></label>
              <label className={label}>
                Source
                <input name="source" list="ad-sources" defaultValue="facebook" className={input} required />
                <datalist id="ad-sources">
                  {sources.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
              <label className={label}>Montant payé (DT)<input name="amount" inputMode="decimal" className={input} required placeholder="120,500" /></label>
            </div>
            <label className={label}>Campagne (facultatif, le même nom que dans le lien utm_campaign)<input name="campaign" className={input} /></label>
            <label className={label}>Note<input name="note" className={input} /></label>
          </ActionForm>
        </Card>
        <Card title="Dernières dépenses">
          {rows.length === 0 ? (
            <Empty>Aucune dépense saisie. Sans elles, le coût par commande livrée reste inconnu.</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-start text-xs text-muted">
                <tr>
                  <th className="py-2 text-start font-medium">Période</th>
                  <th className="py-2 text-start font-medium">Source</th>
                  <th className="py-2 text-start font-medium">Campagne</th>
                  <th className="py-2 text-end font-medium">Montant</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const from = r.day.toISOString().slice(0, 10);
                  const to = new Date(r.day.getTime() + (r.days - 1) * 86_400_000).toISOString().slice(0, 10);
                  return (
                    <tr key={r.id}>
                      <td className="py-2 tabular-nums">{r.days === 1 ? from : `${from} → ${to}`}</td>
                      <td className="py-2">{r.source}</td>
                      <td className="py-2 text-ink-2">{r.campaign ?? "—"}{r.note && <span className="block text-xs text-muted">{r.note}</span>}</td>
                      <td className="py-2 text-end tabular-nums">{formatTND(r.amount)}</td>
                      <td className="py-2 text-end">
                        <ConfirmButton action={deleteAdSpend.bind(null, r.id)} label="Supprimer" confirmText="Supprimer cette dépense ?" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
