"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeForecast } from "./actions";

/** Deletes one saved forecast, after a confirmation: it also leaves the correction of the next ones. */
export function DeleteForecast({ id }: { id: string }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={busy}
      className="flex h-10 items-center text-[13px] text-clay underline disabled:opacity-50"
      onClick={() => {
        if (!window.confirm("Supprimer cette prévision ? Elle ne servira plus à corriger les suivantes.")) return;
        start(async () => {
          await removeForecast(id);
          router.refresh();
        });
      }}
    >
      Supprimer
    </button>
  );
}
