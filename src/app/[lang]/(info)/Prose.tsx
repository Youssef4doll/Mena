export function Prose({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl px-4 pt-10">
      <h1 className="mb-6 font-display text-[34px] leading-tight">{title}</h1>
      <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-ink-2 [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-xl [&_h2]:text-ink [&_li]:ms-5 [&_li]:list-disc [&_table]:w-full [&_td]:border-b [&_td]:border-line [&_td]:py-2 [&_th]:border-b [&_th]:border-line [&_th]:py-2 [&_th]:text-start">
        {children}
      </div>
    </article>
  );
}
