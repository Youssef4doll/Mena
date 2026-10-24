"use client";

import { useTransition } from "react";
import { setDeviceExcluded } from "./actions";
import { btn } from "@/components/admin/ui";

/** A tester's phone or a second computer: its visits to the shop are left out of these figures. */
export function ExcludeDevice({ excluded }: { excluded: boolean }) {
  const [busy, start] = useTransition();
  return (
    <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
      {excluded ? "Cet appareil est exclu des statistiques." : "Vos visites sont exclues tant que vous êtes connecté. Un téléphone de test sans connexion :"}
      <button type="button" className={`${btn.ghost} h-8`} disabled={busy} onClick={() => start(() => setDeviceExcluded(!excluded))}>
        {excluded ? "Compter de nouveau cet appareil" : "Exclure cet appareil"}
      </button>
    </p>
  );
}
