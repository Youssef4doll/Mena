import { dict, type Lang } from "@/i18n";
import { IconCash, IconChat, IconReturn, IconTruck } from "./Icons";

export function TrustBar({ lang, returnDays, whatsapp, compact = false }: { lang: Lang; returnDays: number; whatsapp: boolean; compact?: boolean }) {
  const t = dict(lang);
  const items = [
    { icon: <IconCash />, title: t.trust.cod, sub: t.trust.codSub },
    { icon: <IconTruck />, title: t.trust.delivery, sub: t.trust.deliverySub },
    { icon: <IconReturn />, title: t.trust.returns(returnDays), sub: t.trust.returnsSub },
    ...(whatsapp ? [{ icon: <IconChat />, title: t.trust.support, sub: t.trust.supportSub }] : []),
  ];
  return (
    <ul className={`grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-4"}`}>
      {items.map((i) => (
        <li key={i.title} className={`flex items-start gap-3 ${compact ? "" : "rounded-2xl bg-white/70 p-3.5"}`}>
          <span className="mt-0.5 text-sea">{i.icon}</span>
          <span className="flex flex-col">
            <span className="text-[13px] font-semibold leading-tight text-ink">{i.title}</span>
            <span className="text-[12px] leading-snug text-muted">{i.sub}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
