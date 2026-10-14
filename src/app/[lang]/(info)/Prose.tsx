/** The frame of every information page: white, one comfortable column, body text at 17px. */
/** `french`: a French-only text shown on the Arabic site keeps its own direction and punctuation. */
export function Prose({ title, children, french = false }: { title: string; children: React.ReactNode; french?: boolean }) {
  return (
    <div className="bg-white">
      <article {...(french ? { lang: "fr", dir: "ltr" } : {})} className="mx-auto max-w-[38rem] px-4 pb-16 pt-8 md:pt-14">
        <h1 className="text-[28px] leading-tight md:text-[34px]">{title}</h1>
        <div className="mt-6 flex flex-col gap-3 text-[17px] leading-[1.7] text-ink-2 [&_h2]:mt-7 [&_h2]:text-[20px] [&_h2]:leading-snug [&>ul]:flex [&>ul]:flex-col [&>ul]:gap-2 [&>ul>li]:ms-5 [&>ul>li]:list-disc [&>ul>li]:ps-1 [&_p>a]:text-sea [&_p>a]:underline [&_p>a]:underline-offset-4">
          {children}
        </div>
      </article>
    </div>
  );
}
