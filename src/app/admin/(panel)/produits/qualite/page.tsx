import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { CHECKS, productQuality, scoreTone, type QualityKey } from "@/lib/product-quality";
import { Badge, Card, PageTitle, Stat, Tabs } from "@/components/admin/ui";

export const metadata = { title: "Qualité des fiches" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * Every product's page scored out of 100, the weakest first, with what each
 * one lacks: photos, long pictures, texts in both languages, the supplier
 * check. Read-only: each line opens the product's editor.
 */
export default async function QualityPage({ searchParams }: PageProps<"/admin/produits/qualite">) {
  await requireAdmin();
  const sp = await searchParams;
  const scope = one(sp.f) === "all" ? "all" : "active";
  const want = CHECKS.find((c) => c.key === one(sp.manque))?.key ?? null;

  const rows = await prisma.product.findMany({
    where: scope === "active" ? { active: true } : {},
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: {
      id: true, name: true, nameAr: true, active: true, summary: true, summaryAr: true, description: true, descriptionAr: true, specs: true,
      keywords: true, seoTitle: true, seoDescription: true, categoryId: true, cost: true, videoUrl: true, checkedAt: true,
      images: { orderBy: { sort: "asc" }, select: { kind: true, mediaId: true } },
      offers: { select: { quantity: true, label: true, labelAr: true, active: true } },
    },
  });
  const scored = rows
    .map((p) => {
      const gallery = p.images.filter((i) => i.kind === "GALLERY");
      return { p, photo: gallery[0]?.mediaId ?? null, ...productQuality({ ...p, gallery: gallery.length, details: p.images.length - gallery.length }) };
    })
    .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name));
  const lacking = (k: QualityKey) => scored.filter((s) => s.missing.some((m) => m.key === k)).length;
  const shown = want ? scored.filter((s) => s.missing.some((m) => m.key === want)) : scored;
  const average = scored.length ? Math.round(scored.reduce((s, x) => s + x.score, 0) / scored.length) : 0;
  const good = scored.filter((s) => s.score >= 80).length;
  const weak = scored.filter((s) => s.score < 50).length;
  const link = (change: { f?: string; manque?: string | null }) => {
    const q = new URLSearchParams();
    const f = change.f ?? scope;
    const m = change.manque === undefined ? want : change.manque;
    if (f === "all") q.set("f", "all");
    if (m) q.set("manque", m);
    const s = q.toString();
    return `/admin/produits/qualite${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title="Qualité des fiches"
        sub="Chaque fiche notée sur 100 : photos, grandes images, textes en français et en arabe, vérification avec le fournisseur… Les plus faibles d'abord. Rien n'est montré aux clients."
        actions={<Link href="/admin/produits" className="text-sm text-sea underline underline-offset-4">Tous les produits</Link>}
      />
      <Tabs
        current={scope}
        items={[
          { key: "active", label: "En ligne", href: link({ f: "active" }) },
          { key: "all", label: "Tous les produits", href: link({ f: "all" }) },
        ]}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Score moyen" value={`${average}/100`} tone={scoreTone(average) === "danger" ? "danger" : scoreTone(average) === "warn" ? "warn" : "ok"} />
        <Stat label="Fiches" value={String(scored.length)} />
        <Stat label="Bonnes (80 et plus)" value={String(good)} tone="ok" />
        <Stat label="Faibles (moins de 50)" value={String(weak)} tone={weak ? "danger" : undefined} />
      </div>

      <Card title="Ce qui manque le plus" hint="Cliquez pour ne voir que les fiches concernées. Chaque point est sur 100 en tout.">
        <div className="flex flex-wrap gap-2">
          {CHECKS.map((c) => ({ c, n: lacking(c.key) }))
            .filter(({ n }) => n > 0)
            .sort((a, b) => b.c.max * b.n - a.c.max * a.n)
            .map(({ c, n }) => (
              <Link key={c.key} href={link({ manque: want === c.key ? null : c.key })} className={`rounded-full border px-3 py-1.5 text-[13px] ${want === c.key ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2"}`}>
                {c.label} <span className={want === c.key ? "text-white/70" : "text-muted"}>· {n} fiche{n > 1 ? "s" : ""} · {c.max} pts</span>
              </Link>
            ))}
          {want && <Link href={link({ manque: null })} className="px-2 py-1.5 text-[13px] text-sea underline underline-offset-4">Tout voir</Link>}
        </div>
      </Card>

      <Card title={`${shown.length} fiche${shown.length > 1 ? "s" : ""}`}>
        {shown.length === 0 ? (
          <p className="text-sm text-muted">Aucune fiche ici.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line" data-testid="quality-list">
            {shown.map(({ p, photo, score, missing }) => (
              <li key={p.id} className="flex items-start gap-3 py-3">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/img/${photo}/96`} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg border border-line bg-sand object-cover" />
                ) : (
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-sand text-[11px] text-muted">—</span>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/produits/${p.id}`} className="text-sm font-medium text-ink underline-offset-4 hover:underline">{p.name}</Link>
                    {!p.active && <Badge>Hors ligne</Badge>}
                  </div>
                  {missing.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {missing.map((m) => (
                        <li key={m.key} className="rounded-md bg-sand px-2 py-0.5 text-[12px] text-ink-2">
                          {m.text} <span className="text-muted">−{m.lost}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[12px] text-olive">Fiche complète</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${{ ok: "bg-olive-soft text-olive", warn: "bg-[#fbf0d9] text-[#8a5a00]", danger: "bg-clay-soft text-clay" }[scoreTone(score)]}`} data-testid="quality-score">
                  {score}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
