import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin-auth";
import { Logo } from "@/components/shop/Logo";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Connexion" };

export default async function LoginPage() {
  if (await currentAdmin()) redirect("/admin");
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-white p-7 shadow-soft">
        <Logo />
        <h1 className="mb-5 mt-4 text-lg font-semibold">Back-office</h1>
        <LoginForm />
      </div>
    </div>
  );
}
