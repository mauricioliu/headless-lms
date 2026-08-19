import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginView } from "./login-view";
import { getBranding } from "@/lib/api/branding";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await getBranding();
  return { title: `Iniciar sesión — ${brandName}` };
}

export default async function LoginPage() {
  const { brandName } = await getBranding();
  return (
    <Suspense>
      <LoginView brandName={brandName} />
    </Suspense>
  );
}
