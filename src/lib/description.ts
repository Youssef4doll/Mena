/**
 * A product description as the shop shows it: paragraphs separated by a
 * blank line, and the lines that start with "- " (or "•", "✓") shown as a
 * list with ticks, like Amazon's "About this item". Plain text stays plain
 * text: nothing here reads HTML.
 */
export type Block = { kind: "text"; text: string } | { kind: "list"; items: string[] };

const BULLET = /^\s*(?:[-•*✓✔]|\d+[.)])\s+/;

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
