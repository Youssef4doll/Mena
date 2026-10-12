import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl">Page introuvable</h1>
      <p className="text-muted">الصفحة موش موجودة</p>
      <Link href="/" className="rounded-full bg-sea px-5 py-3 text-sm font-medium text-white">
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
