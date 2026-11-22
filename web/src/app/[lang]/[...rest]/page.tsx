import { notFound } from "next/navigation";

/** Any other path under /en or /de: show the localised "not found" page. */
export default function Unknown() {
  notFound();
}
