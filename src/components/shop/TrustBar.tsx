import { dict, type Lang } from "@/i18n";
import { IconCash, IconChat, IconReturn, IconShield, IconTruck } from "./Icons";

/** The shop's promises in one compact card: only the ones its settings make true. */
export function TrustBar({ lang, returnDays, whatsapp, everywhere, openBeforePaying }: { lang: Lang; returnDays: number; whatsapp: boolean; everywhere: boolean; openBeforePaying: boolean }) {
  const t = dict(lang);
  const items = [
    { icon: <IconCash className="h-6 w-6" />, title: t.trust.cod, sub: t.trust.codSub },
    ...(openBeforePaying ? [{ icon: <IconShield className="h-6 w-6" />, title: t.trust.openBeforePaying, sub: "" }] : []),
    { icon: <IconTruck className="h-6 w-6" />, title: everywhere ? t.trust.delivery : t.trust.deliveryHome, sub: everywhere ? t.trust.deliverySub : "" },
    { icon: <IconReturn className="h-6 w-6" />, title: t.trust.returns(returnDays), sub: t.trust.returnsSub },
    ...(whatsapp && !openBeforePaying ? [{ icon: <IconChat className="h-6 w-6" />, title: t.trust.support, sub: t.trust.supportSub }] : []),
  ];
  return (
    <ul className={`grid divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white sm:divide-y-0 ${items.length === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
      {items.map((i) => (
        <li key={i.title} className="flex min-h-14 items-center gap-3 px-4 py-2.5 sm:py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sea-soft text-sea">{i.icon}</span>
          <span className="flex flex-col">
            <span className="text-[17px] font-bold leading-snug text-ink">{i.title}</span>
            {i.sub && <span className="hidden text-[15px] leading-snug text-muted sm:block">{i.sub}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
