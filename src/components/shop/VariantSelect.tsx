"use client";

import { useEffect, useRef, useState } from "react";
import { isPale } from "@/lib/color";
import { formatTND } from "@/lib/money";
import { IconCheck, IconChevronDown } from "./Icons";

export type VariantOption = { id: string; label: string; colorHex: string | null; price: number | null; soldOut: boolean };

/**
 * The option, chosen from a list like the shops customers know: the button
 * shows the choice (its colour dot and its name), a tap opens every option
 * with its colour, its own price when it differs, and whether it is there.
 * Our own list rather than the phone's, so the colours show everywhere.
 * Keyboard: arrows, Enter, Escape, like a native list.
 */
export function VariantSelect({
  id,
  labelledBy,
  options,
  value,
  placeholder,
  soldOutText,
  invalid,
  lang,
  onChange,
}: {
  id: string;
  labelledBy: string;
  options: VariantOption[];
  value: string | null;
  placeholder: string;
  soldOutText: string;
  invalid: boolean;
  lang: "fr" | "ar";
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const chosen = options.find((o) => o.id === value) ?? null;
  // Dots only when some option has a colour; then every name starts at the same place.
  const dots = options.some((o) => o.colorHex);
  const enabled = options.map((o, i) => (o.soldOut ? -1 : i)).filter((i) => i >= 0);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    list.current?.focus({ preventScroll: true });
    list.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  function show() {
    const at = options.findIndex((o) => o.id === value);
    setActive(at >= 0 && !options[at].soldOut ? at : (enabled[0] ?? 0));
    setOpen(true);
  }
  function choose(i: number) {
    const o = options[i];
    if (!o || o.soldOut) return;
    onChange(o.id);
    setOpen(false);
    document.getElementById(id)?.focus({ preventScroll: true });
  }
  function step(dir: 1 | -1) {
    const pos = enabled.indexOf(active);
    const next = enabled[Math.min(enabled.length - 1, Math.max(0, (pos < 0 ? 0 : pos) + dir))];
    if (next != null) setActive(next);
  }

  return (
    <div ref={root} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${labelledBy} ${id}`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
        className={`flex min-h-[52px] w-full items-center gap-3 rounded-2xl border bg-white px-4 text-start text-[16px] transition ${
          invalid ? "border-danger bg-[#fff6f5]" : open ? "border-sea ring-2 ring-sea/20" : "border-field hover:border-sea/60"
        }`}
        data-testid="variant-select"
      >
        {chosen?.colorHex && <Dot hex={chosen.colorHex} />}
        <span className={`min-w-0 flex-1 truncate ${chosen ? "font-bold text-ink" : "text-muted"}`}>{chosen ? chosen.label : placeholder}</span>
        {chosen?.price != null && <span className="shrink-0 text-[15px] text-ink-2 price-nums ltr-nums">{formatTND(chosen.price, lang)}</span>}
        <IconChevronDown className={`h-5 w-5 shrink-0 text-ink-2 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          ref={list}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelledBy}
          aria-activedescendant={`${id}-o${active}`}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") step(1);
            else if (e.key === "ArrowUp") step(-1);
            else if (e.key === "Home") setActive(enabled[0] ?? 0);
            else if (e.key === "End") setActive(enabled[enabled.length - 1] ?? 0);
            else if (e.key === "Enter" || e.key === " ") choose(active);
            else if (e.key === "Escape" || e.key === "Tab") {
              setOpen(false);
              if (e.key === "Escape") document.getElementById(id)?.focus({ preventScroll: true });
              return;
            } else return;
            e.preventDefault();
          }}
          className="absolute inset-x-0 top-full z-30 mt-1.5 flex max-h-80 flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-white p-1.5 shadow-[0_16px_40px_-16px_rgb(15_23_42/.4)] outline-none"
        >
          {options.map((o, i) => {
            const selected = o.id === value;
            return (
              <li
                key={o.id}
                id={`${id}-o${i}`}
                role="option"
                aria-selected={selected}
                aria-disabled={o.soldOut}
                onPointerEnter={() => !o.soldOut && setActive(i)}
                onClick={() => choose(i)}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-[16px] ${o.soldOut ? "cursor-not-allowed text-muted" : "cursor-pointer text-ink"} ${i === active && !o.soldOut ? "bg-sand" : ""} ${selected ? "font-bold" : ""}`}
              >
                {dots && (o.colorHex ? <Dot hex={o.colorHex} faded={o.soldOut} /> : <span className="h-6 w-6 shrink-0" aria-hidden />)}
                <span className={`min-w-0 flex-1 ${o.soldOut ? "line-through" : ""}`}>{o.label}</span>
                {o.soldOut ? (
                  <span className="shrink-0 text-[14px]">{soldOutText}</span>
                ) : (
                  o.price != null && <span className="shrink-0 text-[15px] text-ink-2 price-nums ltr-nums">{formatTND(o.price, lang)}</span>
                )}
                {selected && <IconCheck className="h-5 w-5 shrink-0 text-sea" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The colour itself; a pale one (white, cream) gets a darker ring so it shows on white. */
function Dot({ hex, faded = false }: { hex: string; faded?: boolean }) {
  return <span aria-hidden className={`h-6 w-6 shrink-0 rounded-full ring-1 ring-inset ${isPale(hex) ? "ring-ink/30" : "ring-black/10"} ${faded ? "opacity-40" : ""}`} style={{ background: hex }} />;
}
