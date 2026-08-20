import { Suspense } from "react";
import type { Metadata } from "next";
import { getBranding } from "@/lib/api/branding";

import { InviteView } from "./invite-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await getBranding();
  return { title: `Unirse al equipo — ${brandName}` };
}

export default async function InvitePage() {
  const { brandName } = await getBranding();
  return (
    <Suspense>
      <InviteView brandName={brandName} />
    </Suspense>
  );
}
