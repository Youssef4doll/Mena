import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { STATUS_LABELS } from "@/lib/order-status";

export function PageTitle({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[28px] leading-tight text-ink">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, hint, aside, children, className = "" }: { title?: string; hint?: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line bg-white p-4 sm:p-5 ${className}`}>
      {(title || aside) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>}
          </div>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

const STATUS_TONE: Record<OrderStatus, string> = {
  PENDING: "bg-[#fff3d6] text-[#8a5a00]",
  CONFIRMED: "bg-sea-soft text-sea-2",
  SUPPLIER_ORDERED: "bg-[#ece7f1] text-[#5b4a7a]",
  SHIPPED: "bg-[#e0f0f5] text-[#1d6a80]",
  DELIVERED: "bg-olive-soft text-olive",
  REFUSED: "bg-clay-soft text-clay",
  RETURNED: "bg-clay-soft text-clay",
  CANCELLED: "bg-sand text-muted",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium ${STATUS_TONE[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" | "danger" | "ok" | "info" }) {
  const cls = { neutral: "bg-sand text-ink-2", warn: "bg-[#fff3d6] text-[#8a5a00]", danger: "bg-clay-soft text-clay", ok: "bg-olive-soft text-olive", info: "bg-sea-soft text-sea-2" }[tone];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

export const btn = {
  primary: "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-white disabled:opacity-50",
  sea: "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-sea px-4 text-sm font-medium text-white disabled:opacity-50",
  ghost: "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-line bg-white px-4 text-sm font-medium text-ink disabled:opacity-50",
  danger: "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-clay/40 bg-white px-4 text-sm font-medium text-clay disabled:opacity-50",
  wa: "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[#1f9d55] px-4 text-sm font-medium text-white",
};

export const input = "h-10 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-sea";
export const label = "flex flex-col gap-1 text-[13px] font-medium text-ink-2";

export function Tabs({ items, current }: { items: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 no-scrollbar lg:mx-0 lg:px-0">
      {items.map((i) => (
        <Link key={i.key} href={i.href} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] ${i.key === current ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2"}`}>
          {i.label}
          {i.count != null && <span className={`text-[11px] ${i.key === current ? "text-white/70" : "text-muted"}`}>{i.count}</span>}
        </Link>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">{children}</p>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "ok" | "danger" }) {
  const c = tone === "warn" ? "text-[#8a5a00]" : tone === "danger" ? "text-clay" : tone === "ok" ? "text-olive" : "text-ink";
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-white p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 truncate text-[22px] font-semibold tabular-nums ${c}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}
