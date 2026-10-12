"use client";

import { useActionState, useTransition } from "react";
import { btn } from "./ui";

type R = { ok: true; message?: string } | { ok: false; error: string } | null;

/** A server-action form with its result line underneath. */
export function ActionForm({ action, children, submit = "Enregistrer", className = "" }: { action: (prev: unknown, f: FormData) => Promise<R>; children: React.ReactNode; submit?: string; className?: string }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className={`flex flex-col gap-2 ${className}`}>
      {children}
      <div className="flex items-center gap-3">
        <button disabled={pending} className={btn.primary}>{pending ? "…" : submit}</button>
        {state && <span className={`text-sm ${state.ok ? "text-olive" : "text-danger"}`}>{state.ok ? state.message ?? "OK" : state.error}</span>}
      </div>
    </form>
  );
}

export function ConfirmButton({ action, label, confirmText, className = btn.danger }: { action: () => Promise<unknown>; label: string; confirmText?: string; className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className={className} onClick={() => (!confirmText || confirm(confirmText)) && start(async () => void (await action()))}>
      {label}
    </button>
  );
}
