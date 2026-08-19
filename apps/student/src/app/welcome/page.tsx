/**
 * Invite landing page — where an invited student arrives from the emailed link
 * (`/welcome?token=…`).
 *
 * Resolving the token here, before render, both validates it and yields the
 * invited email, so the address is a fact from the invitation row rather than
 * something the URL asserts. Only the auth form and the accept button are
 * client components.
 */
import type { Metadata } from "next";
import { Organizations, type GetInviteResponse } from "@headless-lms/sdk";

import { AuthShell, AuthHeading } from "@/components/auth/auth-shell";
import { InviteProblem } from "@/components/welcome/invite-problem";
import { InviteAuthForm } from "@/components/welcome/invite-auth-form";
import { AcceptInviteCard } from "@/components/welcome/accept-invite-card";
import { getServerSession } from "@/lib/auth/server-session";
import { authHeaders } from "@/lib/api/server-call";
import { getBranding } from "@/lib/api/branding";
import { ApiError } from "@/lib/api/shared";
import { fullName } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await getBranding();
  return { title: `Invitación — ${brandName}` };
}

// The link carries a one-time token, so there is nothing cacheable here.
export const dynamic = "force-dynamic";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const { brandName } = await getBranding();

  let invite: GetInviteResponse | undefined;
  if (token) {
    try {
      invite = await Organizations.getInvite({ token }, await authHeaders());
    } catch (e) {
      // 404 is the answer for a forged, expired or already-used token — a page
      // state. Every other failure is a real one and stays unhandled.
      if (!(e instanceof ApiError) || e.status !== 404) throw e;
    }
  }

  if (!invite) {
    return (
      <AuthShell brandName={brandName}>
        <InviteProblem message="Este enlace de invitación no es válido o ya expiró." />
      </AuthShell>
    );
  }

  const session = await getServerSession();

  return (
    <AuthShell brandName={brandName}>
      {session ? (
        <>
          <AuthHeading title="Recibiste una invitación">
            Acepta esta invitación para agregar el curso a tu cuenta.
          </AuthHeading>
          <AcceptInviteCard
            token={token}
            invitedEmail={invite.email}
            sessionEmail={session.user.email}
          />
        </>
      ) : (
        <InviteAuthForm token={token} email={invite.email} name={fullName(invite)} />
      )}
    </AuthShell>
  );
}
