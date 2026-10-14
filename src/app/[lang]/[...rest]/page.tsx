import { notFound } from "next/navigation";

/** Any address that matches no page gets the shop's own "page not found", with its header and footer. */
export default function Unknown() {
  notFound();
}
