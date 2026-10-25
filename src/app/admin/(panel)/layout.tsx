import { redirect } from "next/navigation";
import { requireAdmin, destroyAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { Shell } from "@/components/admin/Shell";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // The menu's counts are asked at the same time as the session, one wait instead of two;
  // they are only used, and sent, once the session is confirmed.
  const counts = Promise.all([
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.review.count({ where: { status: "PENDING" } }),
    prisma.returnRequest.count({ where: { status: "REQUESTED" } }),
  ]);
  counts.catch(() => {});
  const admin = await requireAdmin();
  const [pending, reviews, returns] = await counts;
  async function logout() {
    "use server";
    await destroyAdminSession();
    redirect("/admin/connexion");
  }
  const nav = [
    { href: "/admin", label: "Tableau de bord" },
    { href: "/admin/commandes", label: "Commandes", badge: pending },
    { href: "/admin/analytics", label: "Analytics" },
    { href: "/admin/publicites", label: "Publicités" },
    { href: "/admin/depenses", label: "Dépenses pub" },
    { href: "/admin/paniers", label: "Non terminées" },
    { href: "/admin/produits", label: "Produits" },
    { href: "/admin/produits/qualite", label: "Qualité des fiches" },
    { href: "/admin/categories", label: "Catégories" },
    { href: "/admin/fournisseurs", label: "Fournisseurs" },
    { href: "/admin/clients", label: "Clients" },
    { href: "/admin/codes-promo", label: "Codes promo" },
    { href: "/admin/retours", label: "Retours", badge: returns },
    { href: "/admin/avis", label: "Avis", badge: reviews },
    { href: "/admin/parametres", label: "Paramètres" },
  ];
  return (
    <Shell nav={nav} admin={admin.email} logout={logout}>
      {children}
    </Shell>
  );
}
