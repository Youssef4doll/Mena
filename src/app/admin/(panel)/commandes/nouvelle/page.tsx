import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageTitle } from "@/components/admin/ui";
import { NewOrderForm } from "./NewOrderForm";

export const metadata = { title: "Nouvelle commande" };

/** An order taken on WhatsApp or by phone, typed here: same prices and checks as the site. */
export default async function NewOrderPage() {
  const now = new Date();
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      price: true,
      variants: { orderBy: { sort: "asc" }, select: { id: true, name: true, price: true } },
      offers: { where: { active: true, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, orderBy: [{ sort: "asc" }, { quantity: "asc" }], select: { id: true, label: true, quantity: true, price: true } },
    },
  });
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/commandes" className="text-sm text-muted">← Commandes</Link>
      <PageTitle title="Nouvelle commande" sub="Pour une commande prise sur WhatsApp ou au téléphone. Le total, le stock et les codes sont vérifiés comme sur le site, et la commande compte dans les statistiques avec son canal." />
      <NewOrderForm products={products.map((p) => ({ ...p, variants: p.variants.map((v) => ({ ...v, price: v.price ?? p.price })) }))} />
    </div>
  );
}
