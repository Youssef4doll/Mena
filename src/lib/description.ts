/**
 * A product description as the shop shows it: paragraphs separated by a
 * blank line, and the lines that start with "- " (or "•", "✓") shown as a
 * list with ticks, like Amazon's "About this item". A supplier's one line
 * of facts joined by " - " ("Plaques céramique - 450 °C - Garantie 1 an")
 * is such a list too. Plain text stays plain text: nothing here reads HTML.
 */
export type Block = { kind: "text"; text: string } | { kind: "list"; items: string[] };

const BULLET = /^\s*(?:[-•*✓✔]|\d+[.)])\s+/;
/** " - " or " – " between facts on one line. */
const JOINED = /\s+[-–]\s+/;

/** The facts of a line joined by dashes, or null for an ordinary line (one dash in a sentence stays a sentence). */
function joinedFacts(line: string): string[] | null {
  const parts = line.split(JOINED).map((p) => p.trim());
  return parts.length >= 3 && parts.every((p) => p.length >= 3 && /\p{L}|\d/u.test(p)) ? parts : null;
}

export function descriptionBlocks(text: string): Block[] {
  const out: Block[] = [];
  for (const para of text.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    let lines: string[] = [];
    let items: string[] = [];
    const flush = () => {
      if (lines.length) out.push({ kind: "text", text: lines.join("\n") });
      if (items.length) out.push({ kind: "list", items });
      lines = [];
      items = [];
    };
    for (const raw of para.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const facts = BULLET.test(line) ? null : joinedFacts(line);
      if (facts) {
        if (lines.length) {
          out.push({ kind: "text", text: lines.join("\n") });
          lines = [];
        }
        items.push(...facts);
        continue;
      }
      if (BULLET.test(line)) {
        if (lines.length) {
          out.push({ kind: "text", text: lines.join("\n") });
          lines = [];
        }
        items.push(line.replace(BULLET, ""));
      } else {
        if (items.length) {
          out.push({ kind: "list", items });
          items = [];
        }
        lines.push(line);
      }
    }
    flush();
  }
  return out;
}
