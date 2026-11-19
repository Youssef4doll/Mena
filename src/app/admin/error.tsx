"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Row = { at: string; digest: string | null; path: string; kind: string; message: string; stack: string };

/**
 * When a back-office page fails: instead of the blank "This page couldn't
 * load", the menu's way back, a retry, and the server's own message (read
 * from /admin/erreurs, for a signed-in owner), so the cause can be fixed.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    fetch("/admin/erreurs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { errors: [] }))
      .then((d: { errors: Row[] }) => setRows(d.errors))
      .catch(() => setRows([]));
  }, []);
  const mine = rows?.find((r) => error.digest && r.digest === error.digest);
  const shown = mine ? [mine] : (rows ?? []).slice(0, 3);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-ink">Cette page du back-office n&apos;a pas pu s&apos;ouvrir</h1>
      <p className="text-sm text-ink-2">Code de l&apos;erreur : {error.digest ?? "inconnu"}. Vos données ne sont pas touchées.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => reset()} className="min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-white">Réessayer</button>
        <Link href="/admin" className="flex min-h-11 items-center rounded-full border border-line px-5 text-sm">Tableau de bord</Link>
        <Link href="/admin/commandes" className="flex min-h-11 items-center rounded-full border border-line px-5 text-sm">Commandes</Link>
        <Link href="/admin/diagnostic" className="flex min-h-11 items-center rounded-full border border-line px-5 text-sm">Diagnostic</Link>
      </div>
      {shown.length > 0 && (
        <section className="rounded-2xl border border-line bg-white p-4">
          <p className="text-sm font-semibold text-ink">Le message du serveur (à envoyer pour la réparation) :</p>
          {shown.map((r, i) => (
            <pre key={i} className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-sand p-3 text-xs text-ink">
              {`${r.at} · ${r.path} · ${r.kind}\n${r.message}\n${r.stack}`}
            </pre>
          ))}
        </section>
      )}
    </main>
  );
}
