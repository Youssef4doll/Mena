import { ImageResponse } from "next/og";

/**
 * The picture Facebook, WhatsApp and Google show with a link to a page that
 * has none of its own (the home page, the lists, the help pages; a product
 * shows its own photos). The Mena mark and the one fact every order shares:
 * payment on delivery. Latin letters only: the image renderer does not join
 * Arabic letters.
 */
export const alt = "Mena";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#172536", color: "#ffffff" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
          <div style={{ fontSize: 220, fontWeight: 800, letterSpacing: -6, lineHeight: 0.9 }}>mena</div>
          <svg viewBox="0 0 96 16" width="520" height="60" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 6 }}>
            <path d="M5 4.5Q46 17.5 88 5" stroke="#f2c46b" strokeWidth="3.4" />
            <path d="M80.4 1.9 89 4.7 83.5 11.8" stroke="#f2c46b" strokeWidth="3.4" />
          </svg>
        </div>
        <div style={{ marginTop: 56, fontSize: 44, color: "#f2c46b" }}>Paiement à la livraison</div>
      </div>
    ),
    size,
  );
}
