/** The Mena wordmark: an arch (a Tunisian doorway) holding the "m". */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="Mena">
      <svg viewBox="0 0 28 34" className="h-7 w-auto" aria-hidden>
        <path d="M14 1C6.8 1 1 6.8 1 14v19h26V14C27 6.8 21.2 1 14 1Z" fill="var(--color-sea)" />
        <path d="M14 6.5c-4.1 0-7.5 3.4-7.5 7.5v13.5h15V14c0-4.1-3.4-7.5-7.5-7.5Z" fill="var(--color-cream)" />
        <circle cx="14" cy="14.5" r="2.2" fill="var(--color-clay)" />
      </svg>
      <span className="font-display text-[26px] font-semibold leading-none tracking-tight text-ink" style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}>
        mena
      </span>
    </span>
  );
}
