import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge, Empty, PageTitle, Tabs, btn } from "@/components/admin/ui";
import { ConfirmButton } from "@/components/admin/FormBits";
import { moderateReview } from "../simple-actions";
import { Stars } from "@/components/shop/Stars";

export const metadata = { title: "Avis" };

export default async function ReviewsPage({ searchParams }: PageProps<"/admin/avis">) {
  const sp = await searchParams;
  const status = (["PENDING", "APPROVED", "REJECTED"] as const).find((s) => s === sp.s) ?? "PENDING";
  const [reviews, counts] = await Promise.all([
    prisma.review.findMany({ where: { status }, orderBy: { createdAt: "desc" }, take: 200, include: { product: { select: { name: true, slug: true } }, orderItem: { select: { order: { select: { ref: true, id: true } } } } } }),
    prisma.review.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const c = Object.fromEntries(counts.map((x) => [x.status, x._count._all]));
  return (
    <>
      <PageTitle title="Avis" sub="Seuls les clients livrés peuvent laisser un avis (une fois par article). Rien n'est publié sans votre accord." />
      <Tabs current={status} items={[
        { key: "PENDING", label: "À modérer", href: "/admin/avis?s=PENDING", count: c.PENDING ?? 0 },
        { key: "APPROVED", label: "Publiés", href: "/admin/avis?s=APPROVED", count: c.APPROVED ?? 0 },
        { key: "REJECTED", label: "Refusés", href: "/admin/avis?s=REJECTED", count: c.REJECTED ?? 0 },
      ]} />
      {reviews.length === 0 ? <Empty>Aucun avis ici.</Empty> : (
        <ul className="flex flex-col gap-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Stars value={r.rating} />
                <span className="text-sm font-medium">{r.authorName}</span>
                {r.governorate && <span className="text-xs text-muted">{r.governorate}</span>}
                <Badge tone="ok">Client livré</Badge>
                <span className="text-xs text-muted">{r.createdAt.toLocaleDateString("fr-FR")}</span>
              </div>
              <p className="mt-2 text-sm">{r.text || <span className="text-muted">(note sans texte)</span>}</p>
              <p className="mt-2 text-xs text-muted">
                <Link href={`/produit/${r.product.slug}`} target="_blank" className="underline">{r.product.name}</Link> · commande{" "}
                <Link href={`/admin/commandes/${r.orderItem.order.id}`} className="underline">{r.orderItem.order.ref}</Link>
              </p>
              <div className="mt-3 flex gap-2">
                {status !== "APPROVED" && <ConfirmButton action={moderateReview.bind(null, r.id, "APPROVED")} label="Publier" className={btn.sea} />}
                {status !== "REJECTED" && <ConfirmButton action={moderateReview.bind(null, r.id, "REJECTED")} label="Refuser" className={btn.ghost} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
