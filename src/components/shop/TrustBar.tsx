import { dict, type Lang } from "@/i18n";
import { IconCash, IconChat, IconReturn, IconTruck } from "./Icons";

export function TrustBar({ lang, returnDays, whatsapp, everywhere }: { lang: Lang; returnDays: number; whatsapp: boolean; everywhere: boolean }) {
  const t = dict(lang);
  const items = [
    { icon: <IconCash className="h-7 w-7" />, title: t.trust.cod, sub: t.trust.codSub },
    { icon: <IconTruck className="h-7 w-7" />, title: everywhere ? t.trust.delivery : t.trust.deliveryHome, sub: everywhere ? t.trust.deliverySub : "" },
    { icon: <IconReturn className="h-7 w-7" />, title: t.trust.returns(returnDays), sub: t.trust.returnsSub },
    ...(whatsapp ? [{ icon: <IconChat className="h-7 w-7" />, title: t.trust.support, sub: t.trust.supportSub }] : []),
  ];
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((i) => (
        <li key={i.title} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sea-soft text-sea">{i.icon}</span>
          <span className="flex flex-col">
            <span className="text-[17px] font-bold leading-tight text-ink">{i.title}</span>
            {i.sub && <span className="text-[15px] leading-snug text-muted">{i.sub}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
