/**
 * Shown at once on a move inside the back office, in the kept menu, while the
 * next page is read. A title and a few blocks, shaped like a list as much as a
 * form, so nothing jumps when the page arrives. The pulse stops for people
 * who asked their phone for less motion.
 */
export default function Loading() {
  return (
    <div data-loading="" role="status" aria-live="polite" className="motion-safe:animate-pulse">
      <span className="sr-only">Chargement…</span>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3" aria-hidden>
        <div>
          <div className="h-8 w-44 rounded-lg bg-sand-2" />
          <div className="mt-2 h-4 w-60 max-w-full rounded bg-sand" />
        </div>
        <div className="h-10 w-32 rounded-full bg-sand" />
      </div>
      <div className="flex flex-col gap-3" aria-hidden>
        {["w-1/3", "w-1/2", "w-2/5", "w-1/4"].map((w) => (
          <div key={w} className="rounded-2xl border border-line bg-white p-4 sm:p-5">
            <div className={`h-4 rounded bg-sand-2 ${w}`} />
            <div className="mt-3 h-10 rounded-xl bg-sand" />
          </div>
        ))}
      </div>
    </div>
  );
}
