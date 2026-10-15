"use client";

import { track } from "@/lib/client/track";
import { pixelContact } from "@/lib/client/pixels";

/**
 * A WhatsApp, phone or Messenger link that is counted, wherever it sits
 * (footer, menu, contact page, empty search): the back office shows which
 * ways customers use to ask before they order.
 */
export function ContactLink({ kind, where, href, className, children, label }: { kind: "whatsapp" | "phone" | "messenger"; where: string; href: string; className?: string; children: React.ReactNode; label?: string }) {
  const external = kind !== "phone";
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener" } : {})}
      aria-label={label}
      className={className}
      onClick={() => {
        track(`${kind}_clicked`, { props: { where } });
        pixelContact();
      }}
    >
      {children}
    </a>
  );
}
