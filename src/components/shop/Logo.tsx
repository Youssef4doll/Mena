/**
 * The Mena wordmark: the name, and under it a smile that ends in an arrow,
 * "from m to a", everything brought to your door. Drawn for Mena (an even
 * stroke and a simple open arrowhead), so it is our own mark and not
 * another shop's. Never mirrored: a brand reads the same in Arabic.
 */
export function Logo({ className = "", light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={`inline-flex flex-col items-stretch leading-none ${className}`} dir="ltr" aria-label="Mena" role="img">
      <span aria-hidden className={`text-[29px] font-extrabold leading-[0.9] tracking-[-0.02em] ${light ? "text-white" : "text-ink"}`}>
        mena
      </span>
      <svg aria-hidden viewBox="0 0 96 16" className="-mt-0.5 h-[9px] w-full overflow-visible" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 4.5Q46 17.5 88 5" stroke={light ? "var(--color-amber)" : "var(--color-amber-2)"} strokeWidth="3.4" />
        <path d="M80.4 1.9 89 4.7 83.5 11.8" stroke={light ? "var(--color-amber)" : "var(--color-amber-2)"} strokeWidth="3.4" />
      </svg>
    </span>
  );
}

