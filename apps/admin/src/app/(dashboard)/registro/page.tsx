import type { Metadata } from "next";

import { requireManager } from "@/lib/auth/server-session";

import { RegistroView } from "./registro-view";

export const metadata: Metadata = { title: "Qué atestigua el registro" };

// Manager-only (Admin Cliente surface): an instructor arriving here is a 404,
// same as the Olas report it explains. Static content — no fetches.
export default async function RegistroPage() {
  await requireManager();
  return <RegistroView />;
}
