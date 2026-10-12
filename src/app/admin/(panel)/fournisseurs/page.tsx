import { prisma } from "@/lib/prisma";
import { daysAgo } from "@/lib/analytics-range";
import { formatTND } from "@/lib/money";
import { Card, PageTitle, input, label } from "@/components/admin/ui";
import { ActionForm, ConfirmButton } from "@/components/admin/FormBits";
import { saveSupplier, deleteSupplier } from "../simple-actions";

export const metadata = { title: "Fournisseurs" };

export default async function SuppliersPage() {
  const since = daysAgo(30);
  const [suppliers, toOrder] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } }),
    // Confirmed orders waiting to be ordered from each supplier.
    prisma.orderItem.findMany({
      where: { order: { status: "CONFIRMED" }, product: { supplierId: { not: null } } },
      select: { qty: true, unitCost: true, name: true, variantName: true, order: { select: { ref: true } }, product: { select: { supplierId: true, supplierRef: true } } },
    }),
  ]);
  const sales = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { order: { createdAt: { gte: since }, status: { notIn: ["CANCELLED"] } }, product: { supplierId: { not: null } } },
    _sum: { qty: true },
  });
  const productSupplier = new Map((await prisma.product.findMany({ where: { id: { in: sales.map((s) => s.productId!).filter(Boolean) } }, select: { id: true, supplierId: true } })).map((p) => [p.id, p.supplierId]));
  const units = new Map<string, number>();
  for (const s of sales) {
    const sid = productSupplier.get(s.productId!);
    if (sid) units.set(sid, (units.get(sid) ?? 0) + (s._sum.qty ?? 0));
  }

  return (
    <>
      <PageTitle title="Fournisseurs" sub="Chaque produit peut être rattaché à un fournisseur, avec son coût et sa référence." />
      <div className="grid gap-4 lg:grid-cols-2">
        {suppliers.map((s) => {
          const pending = toOrder.filter((i) => i.product?.supplierId === s.id);
          const cost = pending.reduce((n, i) => n + (i.unitCost ?? 0) * i.qty, 0);
          return (
            <Card key={s.id} title={s.name} hint={`${s._count.products} produit(s) · ${units.get(s.id) ?? 0} unités vendues en 30 jours`}>
              {pending.length > 0 && (
                <div className="mb-3 rounded-xl bg-[#fff8e6] p-3 text-sm">
                  <p className="font-medium">À commander maintenant ({pending.length} ligne(s), coût {formatTND(cost)})</p>
                  <ul className="mt-1 text-xs text-ink-2">
                    {pending.map((i, n) => (
                      <li key={n}>{i.order.ref} · {i.qty} × {i.name}{i.variantName && ` (${i.variantName})`}{i.product?.supplierRef && ` · réf. ${i.product.supplierRef}`}</li>
                    ))}
                  </ul>
                </div>
              )}
              <SupplierFields s={s} />
              {s._count.products === 0 && <div className="mt-2"><ConfirmButton action={deleteSupplier.bind(null, s.id)} label="Supprimer" confirmText="Supprimer ce fournisseur ?" /></div>}
            </Card>
          );
        })}
        <Card title="Nouveau fournisseur"><SupplierFields /></Card>
      </div>
    </>
  );
}

function SupplierFields({ s }: { s?: { id: string; name: string; phone: string | null; contact: string | null; notes: string | null; prepDays: number } }) {
  return (
    <ActionForm action={saveSupplier}>
      <input type="hidden" name="id" value={s?.id ?? ""} />
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>Nom<input name="name" defaultValue={s?.name} className={input} required /></label>
        <label className={label}>Téléphone<input name="phone" defaultValue={s?.phone ?? ""} className={input} /></label>
        <label className={label}>Contact<input name="contact" defaultValue={s?.contact ?? ""} className={input} /></label>
        <label className={label}>Préparation (jours)<input name="prepDays" type="number" min={0} defaultValue={s?.prepDays ?? 1} className={input} /></label>
      </div>
      <label className={label}>Notes<input name="notes" defaultValue={s?.notes ?? ""} className={input} /></label>
    </ActionForm>
  );
}
