import { Suspense } from "react";
import { PageTitle } from "@/components/admin/ui";
import { AdsNav, AdsNavFallback } from "./_ui/AdsNav";

/**
 * The "Publicités" section: one title, the eight tabs and the period picker
 * above whatever tab is open. Each tab reads the period from its own
 * address (adRange in ./_ui/range), so the layout holds no data.
 */
export default function AdsLayout({ children }: LayoutProps<"/admin/publicites">) {
  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Publicités" sub="Ce que chaque publicité coûte et rapporte, jusqu'à la commande livrée et payée." />
      <div className="-mt-3">
        <Suspense fallback={<AdsNavFallback />}>
          <AdsNav />
        </Suspense>
      </div>
      {children}
    </div>
  );
}
