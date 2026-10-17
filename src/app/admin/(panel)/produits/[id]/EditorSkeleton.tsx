/**
 * Shown at once when a product opens, while it is read (from the products'
 * loading.tsx, the only loading boundary on the way: a second one inside it
 * would add React's minimum display time of a fallback twice): the editor's own
 * outline, with the links and the title in their real places, the text and
 * photo cards on the left and the publication, price, stock and supplier
 * cards on the right, each as tall as the real one on a computer, so nothing
 * moves when the product arrives. The pulse stops for people who asked their
 * phone for less motion.
 */
export function EditorSkeleton() {
  return (
    <div data-loading="" role="status" aria-live="polite" className="flex flex-col gap-4 motion-safe:animate-pulse">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden>
        <div className="flex h-10 items-center justify-between gap-2">
          <div className="h-4 w-20 rounded bg-sand" />
          <div className="h-4 w-44 rounded bg-sand" />
        </div>
        <div className="flex min-h-10 items-center">
          <div className="h-7 w-80 max-w-full rounded-lg bg-sand-2" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]" aria-hidden>
        <div className="flex min-w-0 flex-col gap-4">
          <Box title="w-16" hint={2}>
            <div className="grid gap-3">
              <div className="h-[89px] rounded-xl bg-sea-soft" />
              <Pair />
              <Help n={3} />
              <Field />
              <Pair tall="h-[78px]" label="h-10" />
              <Help n={1} />
              <Pair tall="h-[158px]" />
              <Help n={2} />
              <Pair tall="h-[118px]" />
              <Help n={1} />
              <div className="flex flex-col gap-1">
                <Field />
                <Lines n={2} tight />
              </div>
            </div>
          </Box>
          <Box title="w-40" hint={3}>
            <Field tall="h-16" />
          </Box>
          <Box title="w-36" hint={3}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {[0, 1, 2].map((i) => <div key={i} className="aspect-square rounded-xl bg-sand" />)}
            </div>
          </Box>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Box title="w-24">
            <Row />
            <Row />
            <div className="mt-2"><Field /></div>
            <div className="mt-3 flex gap-2 border-t border-line pt-3">
              <Pill w="w-28" />
              <Pill w="w-28" />
            </div>
          </Box>
          <Box title="w-12">
            <Pair />
            <div className="mt-1.5"><Lines n={2} tight /></div>
            <div className="mt-3"><Field /></div>
          </Box>
          <Box title="w-14">
            <div className="flex gap-2">
              <Pill w="w-36" />
              <Pill w="w-28" />
            </div>
            <div className="mt-2"><Lines n={2} tight /></div>
            <div className="mt-2"><Row tall="h-5" /></div>
          </Box>
          <Box title="w-24">
            <Field />
            <div className="mt-2"><Field /></div>
            <div className="mt-2"><Field /></div>
          </Box>
        </div>
      </div>
    </div>
  );
}

/** A card of the editor, as the admin Card draws it: its title line, its hint lines, then its fields. */
function Box({ title, hint = 0, children }: { title: string; hint?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 sm:p-5">
      <div className="mb-3">
        <div className="flex h-[23px] items-center"><div className={`h-4 rounded bg-sand-2 ${title}`} /></div>
        {hint > 0 && <div className="mt-0.5"><Lines n={hint} /></div>}
      </div>
      {children}
    </div>
  );
}

/** A label and its field, 64 px tall like the real ones. */
function Field({ tall = "h-10", label = "h-5" }: { tall?: string; label?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-center ${label}`}><div className="h-3.5 w-24 rounded bg-sand" /></div>
      <div className={`rounded-xl bg-sand ${tall}`} />
    </div>
  );
}

/** The French and Arabic fields side by side, one under the other on a phone. */
function Pair({ tall, label }: { tall?: string; label?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field tall={tall} label={label} />
      <Field tall={tall} label={label} />
    </div>
  );
}

/** Lines of small help text; `tight` for the ones without the hints' wider spacing. */
function Lines({ n, tight }: { n: number; tight?: boolean }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={`flex items-center ${tight ? "h-4" : "h-[19.5px]"}`}>
          <div className={`h-2.5 rounded bg-sand ${i === n - 1 ? "w-2/3" : "w-full"}`} />
        </div>
      ))}
    </div>
  );
}

/** The help under a pair of fields, drawn a little closer to them. */
function Help({ n }: { n: number }) {
  return <div className="-mt-1"><Lines n={n} tight /></div>;
}

/** A switch line of the publication and stock cards. */
function Row({ tall = "h-7" }: { tall?: string }) {
  return (
    <div className={`flex items-center justify-between ${tall}`}>
      <div className="h-3.5 w-28 rounded bg-sand" />
      <div className="h-5 w-5 rounded bg-sand" />
    </div>
  );
}

/** A round button. */
function Pill({ w }: { w: string }) {
  return <div className={`h-10 rounded-full bg-sand ${w}`} />;
}
