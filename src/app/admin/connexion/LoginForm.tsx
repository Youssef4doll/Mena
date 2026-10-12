"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        E-mail
        <input name="email" type="email" autoComplete="username" required className="h-11 rounded-xl border border-line px-3" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Mot de passe
        <input name="password" type="password" autoComplete="current-password" required className="h-11 rounded-xl border border-line px-3" />
      </label>
      {state?.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      <button disabled={pending} className="mt-2 h-11 rounded-full bg-ink font-medium text-white disabled:opacity-60">
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
