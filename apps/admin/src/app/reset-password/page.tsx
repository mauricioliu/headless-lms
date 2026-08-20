import type { Metadata } from "next";
import { getBranding } from "@/lib/api/branding";

import { SetPasswordView } from "./set-password-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await getBranding();
  return { title: `Restablecer contraseña — ${brandName}` };
}

// The reset mail's link resolves here with `?token=…` (valid) or `?error=…`
// (invalid/expired) — better-auth validates the token before redirecting, so a
// missing token on this page is always a broken link.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const invalid = sp.error === "INVALID_TOKEN" || token === "";
  return <SetPasswordView token={invalid ? null : token} />;
}
