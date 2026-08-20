"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Set-password landing for the reset mail's Trabajador readers: the register
 *  is the portal's own `tú`. Errors map by status; a consumed or expired token
 *  (400) reads the same as arriving without one. */
export function SetPasswordView({ brandName, token }: { brandName: string; token: string | null }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Usa al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    const { error: failure } = await authClient.resetPassword({
      newPassword: password,
      token: token ?? "",
    });
    if (failure) {
      setError(
        failure.status === 400
          ? "El enlace expiró o ya se usó. Pide uno nuevo desde el inicio de sesión."
          : "No pudimos guardar la contraseña. Inténtalo de nuevo.",
      );
      setSubmitting(false);
      return;
    }
    setDone(true);
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6 rounded-card border border-line bg-surface p-6">
          <span className="text-lg font-semibold tracking-tight text-ink">{brandName}</span>
          {!token ? (
            <InvalidToken message="El enlace expiró o ya se usó. Pide uno nuevo desde el inicio de sesión." />
          ) : done ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <div className="grid size-10 place-items-center rounded-full bg-surface-2 text-brand">
                <ShieldCheck className="size-5" />
              </div>
              <h1 className="text-lg font-semibold tracking-tight text-ink">
                Contraseña restablecida
              </h1>
              <p className="text-sm text-ink-3 text-pretty">
                Tu nueva contraseña quedó guardada. Entra al portal con ella.
              </p>
              <Button variant="brand" className="mt-2 w-full" asChild>
                <Link href="/login">Ir a iniciar sesión</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <h1 className="text-2xl font-semibold tracking-tight text-ink text-balance">
                  Elegir contraseña nueva
                </h1>
                <p className="text-sm text-ink-3 text-pretty">
                  Elige la contraseña para entrar al portal; usa al menos 8 caracteres.
                </p>
              </div>
              {error && (
                <div className="flex items-start gap-2.5 rounded-lg border border-quiz-wrong-border bg-quiz-wrong-bg px-3 py-2.5 text-sm text-quiz-wrong-fg">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
              <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-ink">
                    Contraseña nueva
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Al menos 8 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="confirm" className="text-sm font-medium text-ink">
                    Confirmar contraseña
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
                <Button type="submit" variant="brand" disabled={submitting} className="mt-1 w-full">
                  {submitting && <Loader2 className="animate-spin" />}
                  Guardar contraseña
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InvalidToken({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold tracking-tight text-ink">Enlace no válido</h1>
      <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-quiz-wrong-border bg-quiz-wrong-bg px-3 py-2.5 text-sm text-quiz-wrong-fg">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>{message}</p>
      </div>
      <Button variant="secondary" className="mt-4 w-full" asChild>
        <Link href="/login">Ir a iniciar sesión</Link>
      </Button>
    </div>
  );
}

const inputClass = cn(
  "h-9 w-full rounded-md border border-line-btn bg-surface px-3 text-sm text-ink",
  "placeholder:text-ink-faint transition-colors outline-none",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30",
);
