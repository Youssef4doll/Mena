import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import "../globals.css";

const body = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = { title: { default: "Back-office", template: "%s · Mena admin" }, robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#17181c", width: "device-width", initialScale: 1 };

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={body.variable}>
      <body className="min-h-dvh bg-cream">{children}</body>
    </html>
  );
}
