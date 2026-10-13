"use client";

import { useState, useTransition } from "react";
import type { CallOutcome, OrderStatus } from "@prisma/client";
import { logCall, setBlacklist, setStatus, updateDetails } from "../actions";
import { btn, input, label } from "@/components/admin/ui";

function useAction() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error ?? "Erreur." });
    });
  return { pending, msg, run };
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p className={`mt-2 text-sm ${msg.ok ? "text-olive" : "text-danger"}`}>{msg.text}</p>;
}

const OUTCOMES: { v: CallOutcome; label: string; cls: string }[] = [
  { v: "CONFIRMED", label: "Confirmée", cls: btn.sea },
  { v: "NO_ANSWER", label: "Pas de réponse", cls: btn.ghost },
  { v: "CALL_BACK", label: "À rappeler", cls: btn.ghost },
  { v: "WRONG_NUMBER", label: "Mauvais numéro", cls: btn.ghost },
  { v: "CANCELLED_BY_CUSTOMER", label: "Annulée par le client", cls: btn.danger },
];

export function CallPanel({ orderId }: { orderId: string }) {
  const [note, setNote] = useState("");
  const { pending, msg, run } = useAction();
  return (
    <div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (facultatif) : rappeler après 18h, adresse corrigée…" className={input} />
      <div className="mt-2 flex flex-wrap gap-2">
        {OUTCOMES.map((o) => (
          <button key={o.v} type="button" disabled={pending} className={o.cls} onClick={() => run(() => logCall(orderId, o.v, note))}>
            {o.label}
          </button>
        ))}
      </div>
      <Msg msg={msg} />
    </div>
  );
}

export function StatusPanel({ orderId, next, carrier: c0, tracking: t0 }: { orderId: string; next: { status: OrderStatus; label: string }[]; carrier: string; tracking: string }) {
  const [carrier, setCarrier] = useState(c0);
  const [tracking, setTracking] = useState(t0);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const { pending, msg, run } = useAction();
  if (next.length === 0) return <p className="text-sm text-muted">Statut final.</p>;
  const ship = next.some((n) => n.status === "SHIPPED");
  const refuse = next.some((n) => n.status === "REFUSED");
  return (
    <div className="flex flex-col gap-3">
      {ship && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={label}>Transporteur<input value={carrier} onChange={(e) => setCarrier(e.target.value)} className={input} /></label>
          <label className={label}>N° de suivi<input value={tracking} onChange={(e) => setTracking(e.target.value)} className={input} /></label>
        </div>
      )}
      {refuse && (
        <label className={label}>
          Motif si refusée
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={input}>
            <option value="">—</option>
            <option>Client injoignable</option>
            <option>A changé d&apos;avis</option>
            <option>Pas d&apos;argent sur place</option>
            <option>Produit ne correspond pas</option>
            <option>Délai trop long</option>
            <option>Adresse introuvable</option>
            <option>Autre</option>
          </select>
        </label>
      )}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (facultatif)" className={input} />
      <div className="flex flex-wrap gap-2">
        {next.map((n) => (
          <button
            key={n.status}
            type="button"
            disabled={pending}
            className={n.status === "CANCELLED" || n.status === "REFUSED" || n.status === "RETURNED" ? btn.danger : btn.primary}
            onClick={() => {
              if ((n.status === "CANCELLED" || n.status === "REFUSED") && !confirm(`Passer la commande en « ${n.label} » ?`)) return;
              run(() => setStatus(orderId, n.status, { carrier, trackingNumber: tracking, refusalReason: reason, note }));
            }}
          >
            → {n.label}
          </button>
        ))}
      </div>
      <Msg msg={msg} />
    </div>
  );
}

type Details = { name: string; phoneAlt: string; city: string; address: string; note: string; carrier: string; trackingNumber: string };

export function DetailsForm({ orderId, initial }: { orderId: string; initial: Details }) {
  const [d, setD] = useState(initial);
  const { pending, msg, run } = useAction();
  const f = (k: keyof Details) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value }), className: input });
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateDetails(orderId, d));
      }}
    >
      <label className={label}>Nom<input {...f("name")} /></label>
      <label className={label}>Second numéro<input {...f("phoneAlt")} inputMode="tel" /></label>
      <label className={label}>Ville (facultatif)<input {...f("city")} /></label>
      {/* A textarea: an input would drop the line breaks the customer typed. */}
      <label className={label}>Adresse<textarea {...f("address")} rows={2} className={`${input} h-auto py-2`} /></label>
      <label className={label}>Note<input {...f("note")} /></label>
      <label className={label}>Transporteur<input {...f("carrier")} /></label>
      <label className={label}>N° de suivi<input {...f("trackingNumber")} /></label>
      <button disabled={pending} className={`${btn.primary} mt-1 self-start`}>Enregistrer</button>
      <Msg msg={msg} />
    </form>
  );
}

export function BlacklistToggle({ customerId, on, reason }: { customerId: string; on: boolean; reason: string }) {
  const { pending, msg, run } = useAction();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={on ? btn.ghost : btn.danger}
        onClick={() => {
          if (on) return run(() => setBlacklist(customerId, false, ""));
          const r = prompt("Motif de la mise en liste noire (ex. 3 refus à la livraison) :", reason || "");
          if (r !== null) run(() => setBlacklist(customerId, true, r));
        }}
      >
        {on ? "Retirer de la liste noire" : "Mettre en liste noire"}
      </button>
      <Msg msg={msg} />
    </>
  );
}
