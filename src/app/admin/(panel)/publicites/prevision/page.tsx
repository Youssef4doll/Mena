import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { translationReady } from "@/lib/translate";
import { tunisDay } from "@/lib/analytics-range";
import { briefProducts } from "@/lib/ads/brief-data";
import { forecastEnv, forecastHistory, readBenchmarks, MEASURE_DAYS } from "@/lib/ads/forecast-data";
import { Empty } from "@/components/admin/ui";
import { ForecastTab } from "./ForecastTab";
import { History } from "./History";

export const metadata = { title: "Prévision · Publicités" };
// A web search or the reading of several ads by Claude can take a few minutes; the server actions take the page's limit.
export const maxDuration = 300;

/**
 * "Prévision": what a Meta plan should bring for one product, before the
 * money is spent. The shop's own measures, public figures with their pages,
 * and Claude's reading of the real ads, as ranges; the test budget from the
 * advisor's own rule; and the saved forecasts set against what really
 * happened, which correct the next ones.
 */

function str(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

export default async function ForecastPage({ searchParams }: PageProps<"/admin/publicites/prevision">) {
  await requireAdmin();
  const sp = await searchParams;
  const now = new Date();
  const wanted = str(sp.produit);
  const [options, store, history] = await Promise.all([briefProducts(now), readBenchmarks(), forecastHistory(now)]);
  const id = wanted && /^[a-z0-9]{20,40}$/.test(wanted) && options.some((o) => o.id === wanted) ? wanted : options[0]?.id;
  const env = id ? await forecastEnv(id, now, history.calibration) : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-ink-2">
        Combien d&apos;acheteurs un plan Meta devrait amener pour un produit, combien il peut coûter, et quel budget de test donner, à partir de vos chiffres ({MEASURE_DAYS} derniers jours), de chiffres publics avec leurs sources, et de la lecture de vos vraies publicités par Claude.
      </p>
      <nav aria-label="Sur cette page" className="flex flex-wrap items-center gap-x-4 text-[13px]">
        <span className="text-xs text-muted">Sur cette page :</span>
        {[
          ["#publicites", "Publicités"],
          ["#chiffres", "Chiffres publics"],
          ["#plan", "Plan"],
          ["#historique", "Prévisions et vrais résultats"],
        ].map(([href, text]) => (
          <a key={href} href={href} className="flex h-10 items-center text-sea underline underline-offset-4">
            {text}
          </a>
        ))}
      </nav>

      {!env ? (
        <Empty>
          Aucun produit. <Link href="/admin/produits/nouveau" className="underline">Ajoutez un produit</Link> pour prévoir ses publicités.
        </Empty>
      ) : (
        <ForecastTab
          key={env.input.product.id}
          options={options}
          initial={{ input: env.input, photos: env.photos, offers: env.env.offers, shop: env.env.shop, optimized: env.env.optimized }}
          store={store}
          aiReady={translationReady()}
          today={tunisDay(now)}
        />
      )}

      <section id="historique" className="scroll-mt-16">
        <History rows={history.rows} calibration={history.calibration} />
      </section>
    </div>
  );
}
