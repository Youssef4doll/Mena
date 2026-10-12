import { prisma } from "@/lib/prisma";
import { formatTND, toInputTND } from "@/lib/money";
import { Badge, Card, PageTitle, input, label, btn } from "@/components/admin/ui";
import { ActionForm, ConfirmButton } from "@/components/admin/FormBits";
import { savePromo, togglePromo } from "../simple-actions";

export const metadata = { title: "Codes promo" };

export default async function PromoPage() {
  const [codes, stats] = await Promise.all([
    prisma.promoCode.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.order.groupBy({ by: ["promoCodeId"], where: { promoCodeId: { not: null }, status: { not: "CANCELLED" } }, _count: { _all: true }, _sum: { total: true, discount: true } }),
  ]);
  const delivered = await prisma.order.groupBy({ by: ["promoCodeId"], where: { promoCodeId: { not: null }, status: "DELIVERED" }, _count: { _all: true } });
  const st = new Map(stats.map((s) => [s.promoCodeId, s]));
  const dl = new Map(delivered.map((s) => [s.promoCodeId, s._count._all]));
  return (
    <>
      <PageTitle title="Codes promo" sub="Le code est vérifié par le serveur à chaque commande : dates, minimum, nombre d'utilisations, une fois par numéro." />
      <div className="grid gap-4 lg:grid-cols-2">
        {codes.map((c) => {
          const s = st.get(c.id);
          return (
            <Card
              key={c.id}
              title={c.code}
              aside={
                <span className="flex items-center gap-2">
                  {c.active ? <Badge tone="ok">Actif</Badge> : <Badge>Inactif</Badge>}
                  <ConfirmButton action={togglePromo.bind(null, c.id, !c.active)} label={c.active ? "Désactiver" : "Activer"} className={btn.ghost} />
                </span>
              }
            >
              <p className="mb-3 text-sm text-ink-2">
                {s?._count._all ?? 0} commande(s) · {dl.get(c.id) ?? 0} livrée(s) · CA {formatTND(s?._sum.total ?? 0)} · remises {formatTND(s?._sum.discount ?? 0)}
              </p>
              <PromoFields c={c} />
            </Card>
          );
        })}
        <Card title="Nouveau code"><PromoFields /></Card>
      </div>
    </>
  );
}

type P = { id: string; code: string; kind: string; value: number; minSubtotal: number; maxUses: number | null; oncePerPhone: boolean; startsAt: Date | null; endsAt: Date | null; active: boolean };
const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "");

function PromoFields({ c }: { c?: P }) {
  return (
    <ActionForm action={savePromo}>
      <input type="hidden" name="id" value={c?.id ?? ""} />
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>Code<input name="code" defaultValue={c?.code} className={`${input} uppercase`} required /></label>
        <label className={label}>
          Type
          <select name="kind" defaultValue={c?.kind ?? "PERCENT"} className={input}>
            <option value="PERCENT">Pourcentage</option>
            <option value="FIXED">Montant fixe</option>
            <option value="FREE_DELIVERY">Livraison offerte</option>
          </select>
        </label>
        <label className={label}>Valeur (% ou DT)<input name="value" defaultValue={c ? (c.kind === "FIXED" ? toInputTND(c.value) : c.kind === "PERCENT" ? String(c.value) : "") : ""} className={input} /></label>
        <label className={label}>Minimum d&apos;achat (DT)<input name="minSubtotal" defaultValue={c && c.minSubtotal ? toInputTND(c.minSubtotal) : ""} className={input} /></label>
        <label className={label}>Utilisations max<input name="maxUses" type="number" min={1} defaultValue={c?.maxUses ?? ""} className={input} /></label>
        <span />
        <label className={label}>Début<input name="startsAt" type="date" defaultValue={d(c?.startsAt ?? null)} className={input} /></label>
        <label className={label}>Fin<input name="endsAt" type="date" defaultValue={d(c?.endsAt ?? null)} className={input} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="oncePerPhone" defaultChecked={c?.oncePerPhone ?? true} /> Une fois par numéro de téléphone</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={c?.active ?? true} /> Actif</label>
    </ActionForm>
  );
}
