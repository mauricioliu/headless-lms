"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Loader2 } from "lucide-react";

import { authClient, signIn, signUp } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/app-shell/logo";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Stage = "activating" | "create" | "signin" | "invalid";

/** Stages the token in the API's activation cookie (or consumes it when a session exists). */
async function activateInvite(
  token: string,
): Promise<
  { ok: true; status: "accepted" | "auth-required"; accountExists: boolean } | { ok: false }
> {
  const res = await fetch(`${API_URL}/api/organizations/invites/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token }),
  });
  if (!res.ok) return { ok: false };
  return { ok: true, ...((await res.json()) as { status: "accepted" | "auth-required"; accountExists: boolean }) };
}

/** Claims the invite for the fresh session, then refreshes the cookie cache. */
async function acceptInvite(token: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/organizations/invites/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token }),
  });
  if (!res.ok) return false;
  await authClient.getSession({ query: { disableCookieCache: true } });
  return true;
}

const signUpSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
  password: z.string().min(8, "Use al menos 8 caracteres"),
});
type SignUpValues = z.infer<typeof signUpSchema>;

const signInSchema = z.object({
  password: z.string().min(1, "La contraseña es obligatoria"),
});
type SignInValues = z.infer<typeof signInSchema>;

/**
 * Landing page for staff invite links (`/invite?token=…&email=…`). Same stage
 * machine as the student portal's `/welcome`: activate stages the token, then
 * sign-up/in followed by an explicit accept call grants the membership. Copy
 * register: address-less, `usted` only when unavoidable (ADR 0002).
 */
export function InviteView({ brandName }: { brandName: string }) {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";
  const [stage, setStage] = useState<Stage>("activating");
  const activateStarted = useRef(false);

  useEffect(() => {
    if (!token) {
      setStage("invalid");
      return;
    }
    // Strict-mode double-mount fires this effect twice; the token activate must run once.
    // Results apply unconditionally — the ref keeps the call single-flight, and the strict-mode remount wants this exact result.
    if (activateStarted.current) return;
    activateStarted.current = true;
    activateInvite(token)
      .then((result) => {
        if (!result.ok) {
          setStage("invalid");
          return;
        }
        if (result.status === "accepted") {
          // Session existed — invite consumed and the membership was added.
          // Full reload so the server session resolver picks up the new org.
          window.location.assign("/");
          return;
        }
        // An email that already has an account can only sign in — signing up
        // again is refused by the auth provider.
        setStage(result.accountExists ? "signin" : "create");
      })
      .catch(() => setStage("invalid"));
  }, [token]);

  return (
    <div className="grid min-h-dvh place-items-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo org={brandName} />
        </div>
        <div className="mt-6 rounded-card border border-line bg-surface p-6">
          {stage === "activating" && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Loader2 className="size-6 animate-spin text-ink-3" />
              <p className="text-sm text-ink-3">Revisando la invitación…</p>
            </div>
          )}

          {stage === "invalid" && (
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-semibold tracking-tight text-ink">
                Invitación no encontrada
              </h1>
              <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>Este enlace de invitación no es válido o expiró.</p>
              </div>
              <p className="mt-3 text-sm text-ink-3 text-pretty">
                Pida a quien le invitó que envíe una invitación nueva.
              </p>
            </div>
          )}

          {stage === "create" && (
            <>
              <div className="flex flex-col gap-1">
                <h1 className="text-lg font-semibold tracking-tight text-ink">
                  Unirse al equipo
                </h1>
                <p className="text-sm text-ink-3 text-pretty">
                  Hay una invitación a una organización para este correo. Cree la cuenta o entre
                  para aceptarla.
                </p>
              </div>
              <CreateAccountForm email={email} token={token} />
              <p className="mt-4 text-center text-sm text-ink-3">
                ¿Ya tiene cuenta?{" "}
                <button
                  type="button"
                  onClick={() => setStage("signin")}
                  className="font-medium text-brand underline-offset-4 hover:underline"
                >
                  Iniciar sesión
                </button>
              </p>
            </>
          )}

          {stage === "signin" && (
            <>
              <div className="flex flex-col gap-1">
                <h1 className="text-lg font-semibold tracking-tight text-ink">
                  Unirse al equipo
                </h1>
                <p className="text-sm text-ink-3 text-pretty">
                  Hay una invitación a una organización para este correo. Entre para aceptarla.
                </p>
              </div>
              <SignInForm email={email} token={token} />
              <p className="mt-4 text-center text-sm text-ink-3">
                ¿Necesita crear una cuenta?{" "}
                <button
                  type="button"
                  onClick={() => setStage("create")}
                  className="font-medium text-brand underline-offset-4 hover:underline"
                >
                  Crear cuenta
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function CreateAccountForm({ email, token }: { email: string; token: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", password: "" },
  });

  async function onSubmit(values: SignUpValues) {
    setFormError(null);
    const { error } = await signUp.email({ email, password: values.password, name: values.name });
    if (error) {
      setFormError(
        error.status === 422 || error.code?.startsWith("USER_ALREADY_EXISTS")
          ? "Este correo ya tiene una cuenta. Inicie sesión para aceptar la invitación."
          : "No se pudo crear la cuenta. Inténtelo de nuevo.",
      );
      return;
    }
    if (!(await acceptInvite(token))) {
      setFormError("La cuenta se creó, pero la invitación no se pudo aceptar.");
      return;
    }
    // The membership landed on the session server-side; a full reload lets the
    // server session resolver re-run and render the dashboard.
    window.location.assign("/");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-5 flex flex-col gap-4" noValidate>
      {formError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{formError}</p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register("name")} />
        {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-email">Correo</Label>
        <Input id="invite-email" type="email" value={email} readOnly disabled />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="Al menos 8 caracteres"
          aria-invalid={!!errors.password}
          {...register("password")}
        />
        {errors.password && <p className="text-sm text-danger">{errors.password.message}</p>}
      </div>
      <Button type="submit" variant="primary" disabled={isSubmitting} className="mt-1 w-full">
        {isSubmitting && <Loader2 className="animate-spin" />}
        Crear cuenta
      </Button>
    </form>
  );
}

export function SignInForm({ email, token }: { email: string; token: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { password: "" },
  });

  async function onSubmit(values: SignInValues) {
    setFormError(null);
    const { error } = await signIn.email({ email, password: values.password });
    if (error) {
      setFormError(
        error.status === 401
          ? "Correo o contraseña incorrectos."
          : "No se pudo iniciar sesión. Inténtelo de nuevo.",
      );
      return;
    }
    if (!(await acceptInvite(token))) {
      setFormError("Se inició sesión, pero la invitación no se pudo aceptar.");
      return;
    }
    // The membership landed on the session server-side; full reload so the
    // server session resolver picks it up.
    window.location.assign("/");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-5 flex flex-col gap-4" noValidate>
      {formError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{formError}</p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signin-email">Correo</Label>
        <Input id="signin-email" type="email" value={email} readOnly disabled />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signin-password">Contraseña</Label>
        <Input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          aria-invalid={!!errors.password}
          {...register("password")}
        />
        {errors.password && <p className="text-sm text-danger">{errors.password.message}</p>}
      </div>
      <Button type="submit" variant="primary" disabled={isSubmitting} className="mt-1 w-full">
        {isSubmitting && <Loader2 className="animate-spin" />}
        Entrar
      </Button>
    </form>
  );
}
