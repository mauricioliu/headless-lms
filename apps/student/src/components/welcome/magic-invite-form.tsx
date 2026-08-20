"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, MailCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

/**
 * The invited Trabajador with no session yet. The invitation is passwordless:
 * the button asks the auth engine for a one-time entry link mailed to the
 * invited address — a fact from the invitation row, never something the reader
 * types. Clicking that link lands back here, signed in, one tap from accepting.
 */
export function MagicInviteForm({ email, stale }: { email: string; stale: boolean }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSend() {
    setError(null);
    setSubmitting(true);
    // Back to this same page once the link is used — token in hand, session
    // minted — and back here too if the link turns out stale.
    const here = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    const { error: failure } = await authClient.signIn.magicLink({
      email,
      callbackURL: here,
      errorCallbackURL: here,
    });
    if (failure && failure.status == null) {
      setError("No pudimos enviar el correo. Inténtalo de nuevo.");
      setSubmitting(false);
      return;
    }
    setSent(true);
    setSubmitting(false);
  }

  if (sent) {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 py-4 text-center">
        <div className="grid size-10 place-items-center rounded-full bg-surface-2 text-brand">
          <MailCheck className="size-5" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-ink">Revisa tu correo</h2>
        <p className="text-sm text-ink-3 text-pretty">
          Te enviamos un enlace a <span className="font-medium text-ink">{email}</span>. Ábrelo para
          entrar; funciona una sola vez.
        </p>
        <Button variant="ghost" size="sm" onClick={() => setSent(false)} className="mt-2">
          Enviar el enlace de nuevo
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {(stale || error) && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>
            {error ??
              "El enlace con el que llegaste expiró o ya se usó. Envíate uno nuevo para entrar."}
          </AlertDescription>
        </Alert>
      )}
      <p className="text-sm text-ink-3 text-pretty">
        Te enviamos un enlace a <span className="font-medium text-ink">{email}</span> para que
        entres sin crear contraseña.
      </p>
      <Button
        type="button"
        variant="brand"
        className="w-full"
        disabled={submitting}
        onClick={() => void onSend()}
      >
        {submitting && <Loader2 className="animate-spin" />}
        Enviar el enlace a mi correo
      </Button>
    </div>
  );
}
