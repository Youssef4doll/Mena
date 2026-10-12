import { prisma } from "@/lib/prisma";
import { Card, PageTitle, input, label } from "@/components/admin/ui";
import { ActionForm, ConfirmButton } from "@/components/admin/FormBits";
import { saveCategory, deleteCategory } from "../simple-actions";

export const metadata = { title: "Catégories" };

export default async function CategoriesPage() {
  const cats = await prisma.category.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } });
  return (
    <>
      <PageTitle title="Catégories" sub="Une catégorie sans produit en ligne n'apparaît pas sur la boutique." />
      <div className="grid gap-4 lg:grid-cols-2">
        {cats.map((c) => (
          <Card key={c.id} title={c.name} aside={<span className="text-xs text-muted">{c._count.products} produit(s)</span>}>
            <CategoryFields c={c} />
            {c._count.products === 0 && <div className="mt-2"><ConfirmButton action={deleteCategory.bind(null, c.id)} label="Supprimer" confirmText="Supprimer cette catégorie ?" /></div>}
          </Card>
        ))}
        <Card title="Nouvelle catégorie">
          <CategoryFields />
        </Card>
      </div>
    </>
  );
}

function CategoryFields({ c }: { c?: { id: string; name: string; nameAr: string | null; slug: string; sort: number; active: boolean; imageId: string | null } }) {
  return (
    <ActionForm action={saveCategory}>
      <input type="hidden" name="id" value={c?.id ?? ""} />
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>Nom<input name="name" defaultValue={c?.name} className={input} required /></label>
        <label className={label}>Nom arabe<input name="nameAr" dir="rtl" defaultValue={c?.nameAr ?? ""} className={input} /></label>
        <label className={label}>Adresse<input name="slug" defaultValue={c?.slug} className={input} /></label>
        <label className={label}>Ordre<input name="sort" type="number" defaultValue={c?.sort ?? 0} className={input} /></label>
      </div>
      <div className="flex items-center gap-3">
        {c?.imageId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/img/${c.imageId}/96`} alt="" className="h-14 w-12 rounded-lg object-cover" />
        )}
        <label className={label}>Image<input name="image" type="file" accept="image/*" className="text-sm" /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={c?.active ?? true} /> Visible</label>
    </ActionForm>
  );
}
