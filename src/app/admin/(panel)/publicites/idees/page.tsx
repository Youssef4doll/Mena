import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { translationReady } from "@/lib/translate";
import { SITE_URL } from "@/lib/site";
import { fmt } from "@/lib/viz";
import { daysAgo, ratio, tunisDay } from "@/lib/analytics-range";
import { adRows, knownKeys } from "@/lib/ads/data";
import { BRIEF_DAYS, briefProducts, loadBriefInput } from "@/lib/ads/brief-data";
import { kpis, totalRow } from "@/lib/ads/kpis";
import { sortInsights, trackingInsights, type TrackingSetup } from "@/lib/ads/advisor";
import type { Insight } from "@/lib/ads/types";
import { Card, Empty } from "@/components/admin/ui";
import { adRange, periodText, rangeQuery } from "../_ui/range";
import { adsBasics } from "../_ui/server";
import { coverage as tagged } from "../_ui/format";
import { InsightList } from "../_ui/Insight";
import { IdeasTab } from "./IdeasTab";

export const metadata = { title: "Idées · Publicités" };
// Writing ad concepts with the API key can take a minute; the server action takes the page's limit.
export const maxDuration = 120;

/**
 * "Idées": the creative brief of one product (brief.ts, from its real facts
 * and numbers), new concepts written by claude.ai from a copied request or,
 * with an API key, on the server, the ad link with the platform's macros
 * (utm.ts), and the tracking checklist (pixels, server tokens as booleans,
 * when a purchase is sent, how many orders carry their source).
 */

/** Sources whose orders come from an ad platform, for the UTM coverage line. */
const AD_SOURCES = new Set(["facebook", "instagram", "tiktok"]);

function str(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

export default async function IdeasPage({ searchParams }: PageProps<"/admin/publicites/idees">) {
  await requireAdmin();
  const sp = await searchParams;
  const r = adRange(sp);
  const q = rangeQuery(r);
  const now = new Date();
  const wanted = str(sp.produit);
  const [options, asked, { costs, baseline: base, tracking: setup }, sources, campaigns, known] = await Promise.all([
    briefProducts(now),
    wanted && /^[a-z0-9]{20,40}$/.test(wanted) ? loadBriefInput(wanted, now) : null,
    adsBasics(r.to),
    adRows(r.from, r.to, "source"),
    adRows(r.from, r.to, "campaign"),
    knownKeys(daysAgo(BRIEF_DAYS, now.getTime()), now),
  ]);
  const input = asked ?? (options[0] ? await loadBriefInput(options[0].id, now) : null);

  // The tracking setup is booleans only (adsBasics): no token reaches the page.
  const total = totalRow(sources);
  const k = kpis(total, costs, base, { purchaseAt: setup.purchaseAt });
  const sum = (rows: typeof sources) => rows.reduce((s, x) => s + x.funnel.orders, 0);
  const coverage = tagged(sources);
  const platform = { orders: sum(sources.filter((s) => AD_SOURCES.has(s.source))), tagged: sum(campaigns.filter((c) => AD_SOURCES.has(c.source))) };
  const insights = sortInsights(trackingInsights(sources, total, k, setup, coverage, r.days, base));

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-ink-2">
        Le brief d&apos;un produit tiré de ses vrais chiffres, des idées de publicités, le lien à mettre dans la publicité et la vérification du suivi. Les textes ne disent que ce que la fiche et les réglages disent.
      </p>
      <nav aria-label="Sur cette page" className="flex flex-wrap items-center gap-x-4 text-[13px]">
        <span className="text-xs text-muted">Sur cette page :</span>
        {[
          ["#brief", "Brief"],
          ["#idees", "Nouvelles idées"],
          ["#liens", "Lien de la publicité"],
          ["#suivi", "Suivi"],
        ].map(([href, text]) => (
          <a key={href} href={href} className="flex h-10 items-center text-sea underline underline-offset-4">
            {text}
          </a>
        ))}
      </nav>

      {!input ? (
        <Empty>
          Aucun produit. <Link href="/admin/produits/nouveau" className="underline">Ajoutez un produit</Link> pour préparer ses publicités.
        </Empty>
      ) : (
        <IdeasTab options={options} initial={input} aiReady={translationReady()} site={SITE_URL} known={known} today={tunisDay(now)} />
      )}

      <section id="suivi" className="scroll-mt-16">
        <Tracking setup={setup} confirmRate={base.confirmRate} coverage={coverage} platform={platform} insights={insights} period={periodText(r)} query={q} />
      </section>
    </div>
  );
}

const PURCHASE_AT: Record<TrackingSetup["purchaseAt"], { label: string; text: string }> = {
  placed: { label: "À la commande", text: "Chaque commande passée compte comme un achat, même celles jamais confirmées : l'algorithme apprend aussi des curieux." },
  confirmed: { label: "À la confirmation", text: "L'achat part quand la commande est confirmée au téléphone : moins de fausses commandes dans ce que l'algorithme apprend." },
  delivered: { label: "À la livraison", text: "L'achat part quand le client a payé : le signal le plus propre, mais moins d'événements et plus tard." },
};

/** The tracking checklist: each piece set or not, with where to set it, then the advisor's checks on the measure. */
function Tracking({ setup, confirmRate, coverage, platform, insights, period, query }: { setup: TrackingSetup; confirmRate: number | null; coverage: { orders: number; tagged: number }; platform: { orders: number; tagged: number }; insights: Insight[]; period: string; query: string }) {
  const items: { label: string; ok: boolean; text: string }[] = [
    { label: "Pixel Meta", ok: setup.metaPixel, text: setup.metaPixel ? "Identifiant renseigné." : "Sans pixel, Meta ne sait pas qui achète et cherche des clics." },
    { label: "API Conversions Meta", ok: setup.metaCapi, text: setup.metaCapi ? "Jeton enregistré : les achats partent aussi du serveur." : "Sans jeton, le pixel du navigateur perd des achats (bloqueurs, iPhone, cookies refusés)." },
    { label: "Pixel TikTok", ok: setup.tiktokPixel, text: setup.tiktokPixel ? "Identifiant renseigné." : "À renseigner avant de dépenser sur TikTok." },
    { label: "API Événements TikTok", ok: setup.tiktokEvents, text: setup.tiktokEvents ? "Jeton enregistré." : "Sans jeton, TikTok ne reçoit que les achats vus par le navigateur." },
  ];
  const share = (a: number, b: number) => fmt(ratio(a, b), "pct");
  return (
    <Card title="Suivi" hint={`Ce que les plateformes reçoivent, et si les commandes portent leur source. Commandes du site, ${period}.`} aside={<Link href="/admin/parametres" className="flex h-10 items-center text-sm text-sea underline">Paramètres</Link>}>
      <div className="grid gap-4 lg:grid-cols-2">
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {items.map((i) => (
            <li key={i.label} className="flex items-start gap-3 px-3 py-2.5 text-sm">
              <span aria-hidden className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] text-white ${i.ok ? "bg-olive" : "bg-clay"}`}>{i.ok ? "✓" : "✕"}</span>
              <span className="min-w-0">
                <span className="font-medium text-ink">{i.label}</span> <span className="sr-only">{i.ok ? "oui" : "non"}</span>
                <span className="block text-ink-2">{i.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 text-sm">
          <div className="rounded-xl border border-line px-3 py-2.5">
            <p className="text-xs text-muted">Envoi de l&apos;achat aux plateformes</p>
            <p className="font-medium text-ink">{PURCHASE_AT[setup.purchaseAt].label}</p>
            <p className="text-ink-2">{PURCHASE_AT[setup.purchaseAt].text}</p>
            {setup.purchaseAt === "placed" && confirmRate != null && (
              <p className="mt-1 text-ink-2">Dans la boutique, {fmt(1 - confirmRate, "pct")} des commandes appelées ne sont pas confirmées (180 jours) : elles comptent aussi comme des achats.</p>
            )}
            {setup.purchaseAt !== "placed" && !(setup.metaCapi || setup.tiktokEvents) && (
              <p className="mt-1 text-clay">Cet envoi passe par le serveur : sans jeton d&apos;API, aucune plateforme ne reçoit l&apos;achat.</p>
            )}
          </div>
          <div className="rounded-xl border border-line px-3 py-2.5">
            <p className="text-xs text-muted">Commandes qui portent leur source</p>
            <p className="text-ink">
              <strong className="tabular-nums">{coverage.tagged}</strong> sur {coverage.orders} <span className="text-muted">({share(coverage.tagged, coverage.orders)})</span>
            </p>
            <p className="mt-1 text-xs text-muted">Commandes de Facebook, Instagram ou TikTok avec un nom de campagne (lien UTM)</p>
            <p className="text-ink">
              <strong className="tabular-nums">{platform.tagged}</strong> sur {platform.orders} <span className="text-muted">({share(platform.tagged, platform.orders)})</span>
            </p>
            {platform.orders > platform.tagged && <p className="mt-1 text-ink-2">Les autres viennent d&apos;un lien sans UTM ou de publications non sponsorisées : utilisez le lien de la publicité ci-dessus.</p>}
          </div>
        </div>
      </div>
      {insights.length > 0 && (
        <div className="mt-4">
          <InsightList insights={insights} period={query} />
        </div>
      )}
    </Card>
  );
}
