import { ar } from "@/i18n/ar";
import { fr } from "@/i18n/fr";
import { NotFoundBody } from "./NotFoundBody";

export default function NotFound() {
  return <NotFoundBody copy={{ ar: ar.notFound, fr: fr.notFound }} />;
}
