import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { translationReady } from "@/lib/translate";
import { productQuality, type QualityKey } from "@/lib/product-quality";
import { idsParam } from "@/lib/translate-batch";
import { PageTitle, Tabs } from "@/components/admin/ui";
import { CompleteBatch, type ToComplete } from "./CompleteBatch";

export const metadata = { title: "Compléter depuis le web" };
// Searching the web and reading several pages for one product can take a minute or two.
export const maxDuration = 300;

const MAX_SHOWN = 200;
/** What the web can bring: pictures, long pictures, texts, a video. */
const WEB_KEYS: QualityKey[] = ["photos", "details", "description", "summary", "specs", "video", "google", "keywords", "arabic"];
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * The products whose page lacks what the web can bring, the weakest first:
 * the AI (or claude.ai, or the owner's links) finds the product's pages,
 * the server reads their large pictures and videos, the owner chooses.
 */
export default async function CompletePage({ searchParams }: PageProps<"/admin/produits/completer">) {
  await requireAdmin();
  const sp = await searchParams;
  const scope = one(sp.f) === "all" ? "all" : "active";
  const ids = idsParam(sp.ids);
  const rows = await prisma.product.findMany({
    where: ids ? { id: { in: ids } } : scope === "active" ? { active: true } : {},
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: {
      id: true, name: true, nameAr: true, active: true, summary: true, summaryAr: true, description: true, descriptionAr: true, specs: true, specsAr: true,
      keywords: true, seoTitle: true, seoTitleAr: true, seoDescription: true, seoDescriptionAr: true, categoryId: true, cost: true, videoUrl: true, checkedAt: true,
      images: { orderBy: { sort: "asc" }, select: { kind: true, mediaId: true, source: true } },
      offers: { select: { quantity: true, label: true, labelAr: true, active: true } },
    },
  });
  const list: ToComplete[] = rows
    .flatMap((p) => {
      const gallery = p.images.filter((i) => i.kind === "GALLERY");
      const q = productQuality({ ...p, gallery: gallery.length, details: p.images.length - gallery.length });
      const lacks = q.missing.filter((m) => WEB_KEYS.includes(m.key)).map((m) => m.text);
      if (!ids && !lacks.length) return [];
      return [{
        id: p.id, name: p.name, nameAr: p.nameAr ?? "", active: p.active, score: q.score, lacks,
        photo: gallery[0]?.mediaId ?? null, sources: p.images.flatMap((i) => (i.source ? [i.source] : [])), gallery: gallery.length, details: p.images.length - gallery.length, hasVideo: Boolean(p.videoUrl?.trim()),
        current: {
          summary: p.summary, summaryAr: p.summaryAr ?? "", description: p.description, descriptionAr: p.descriptionAr ?? "", specs: p.specs, specsAr: p.specsAr ?? "",
          keywords: p.keywords, seoTitle: p.seoTitle, seoTitleAr: p.seoTitleAr ?? "", seoDescription: p.seoDescription, seoDescriptionAr: p.seoDescriptionAr ?? "",
        },
      }];
    })
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title="Compléter depuis le web"
        sub="Photos, grandes images, vidéo et textes trouvés sur les pages du même produit (la marque, les grandes boutiques). Vous choisissez avant que rien ne soit enregistré."
        actions={<Link href="/admin/produits/qualite" className="text-sm text-sea underline underline-offset-4">Qualité des fiches</Link>}
      />
      {!ids && (
        <Tabs
          current={scope}
          items={[
            { key: "active", label: "En ligne", href: "/admin/produits/completer" },
            { key: "all", label: "Tous les produits", href: "/admin/produits/completer?f=all" },
          ]}
        />
      )}
      {list.length > MAX_SHOWN && <p className="text-sm text-muted">Les {MAX_SHOWN} fiches les plus faibles sur {list.length}.</p>}
      <CompleteBatch products={list.slice(0, MAX_SHOWN)} aiReady={translationReady()} />
    </div>
  );
}
