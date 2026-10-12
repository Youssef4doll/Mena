import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "../globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = { title: { default: "Back-office", template: "%s · Mena admin" }, robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#17181c", width: "device-width", initialScale: 1 };

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-dvh bg-[#f4f1ea]">{children}</body>
    </html>
  );
}
