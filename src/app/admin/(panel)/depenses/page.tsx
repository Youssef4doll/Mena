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
 * The platform's own counts (impressions, clicks…) are optional here: the
 * ads page uses them when they are given, and an export can be imported
 * there instead of typing them.
 */
/** "12 345 impressions · 230 clics" for a row that has the platform's counts. */
function counts(r: { impressions: number | null; clicks: number | null; reach: number | null; purchases: number | null }): string {
  const int = (v: number) => v.toLocaleString("fr-FR");
  return [
    r.impressions != null && `${int(r.impressions)} impressions`,
    r.clicks != null && `${int(r.clicks)} clics`,
    r.reach != null && `couverture ${int(r.reach)}`,
    r.purchases != null && `${int(r.purchases)} achats (pixel)`,
  ]
    .filter(Boolean)
    .join(" · ");
}

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
            Recopiez ici ce que le gestionnaire de publicités indique, par jour ou par semaine. Les <Link href="/admin/analytics" className="underline">Analytics</Link> en tirent le coût par commande livrée et le bénéfice après publicité. Un export de Meta ou TikTok peut aussi être importé depuis <Link href="/admin/publicites" className="underline">Publicités</Link>.
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
            <details className="rounded-xl border border-line">
              <summary className="flex min-h-10 cursor-pointer items-center px-3 text-sm font-medium text-ink">Chiffres de la plateforme (facultatif)</summary>
              <div className="flex flex-col gap-2 px-3 pb-3">
                <p className="text-xs text-muted">Pour une seule publicité, ou pour la campagne entière. Vide : non donné.</p>
                <label className={label}>Ensemble de publicités<input name="adSet" className={input} /></label>
                <label className={label}>Publicité (le même nom que dans utm_content)<input name="ad" className={input} /></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={label}>Impressions<input name="impressions" inputMode="numeric" className={input} /></label>
                  <label className={label}>Clics sur un lien<input name="clicks" inputMode="numeric" className={input} /></label>
                  <label className={label}>Couverture<input name="reach" inputMode="numeric" className={input} /></label>
                  <label className={label}>Achats (pixel)<input name="purchases" inputMode="numeric" className={input} /></label>
                </div>
              </div>
            </details>
            <label className={label}>Note<input name="note" className={input} /></label>
          </ActionForm>
        </Card>
        <Card title="Dernières dépenses">
          {rows.length === 0 ? (
            <Empty>Aucune dépense saisie. Sans elles, le coût par commande livrée reste inconnu.</Empty>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[520px] text-sm">
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
                        <td className="py-2 text-ink-2">
                          {[r.campaign ?? "—", r.adSet, r.ad].filter(Boolean).join(" › ")}
                          {counts(r) && <span className="block text-xs text-muted tabular-nums">{counts(r)}</span>}
                          {r.note && <span className="block text-xs text-muted">{r.note}</span>}
                        </td>
                        <td className="py-2 text-end tabular-nums">{formatTND(r.amount)}</td>
                        <td className="py-2 text-end">
                          <ConfirmButton action={deleteAdSpend.bind(null, r.id)} label="Supprimer" confirmText="Supprimer cette dépense ?" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
