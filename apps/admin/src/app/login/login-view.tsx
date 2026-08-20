"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Loader2 } from "lucide-react";

import { authClient, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { AuthShell } from "./auth-shell";
import { ForgotPasswordForm } from "./forgot-password";

const schema = z.object({
  email: z.string().min(1, "El correo es obligatorio").email("Ingrese un correo válido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});
type Values = z.infer<typeof schema>;

/** Login surface for the Admin Cliente. Register: address-less, `usted` only
 *  when a pronoun is unavoidable. API errors map to Spanish by status — the
 *  server's English message never shows. */
export function LoginView({ brandName }: { brandName: string }) {
  const [mode, setMode] = useState<"signin" | "forgot">("signin");

  return (
    <AuthShell brandName={brandName}>
      {mode === "forgot" ? (
        <ForgotPasswordForm onBack={() => setMode("signin")} />
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-ink text-balance">
              Iniciar sesión
            </h1>
            <p className="text-sm text-ink-3 text-pretty">
              Acceso al panel de administración del curso.
            </p>
          </div>
          <LoginForm onForgotPassword={() => setMode("forgot")} />
        </>
      )}
    </AuthShell>
  );
}

function LoginForm({ onForgotPassword }: { onForgotPassword: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    const { error } = await signIn.email(values);
    if (error) {
      setFormError(
        error.status === 401
          ? "Correo o contraseña incorrectos."
          : "No se pudo iniciar sesión. Inténtelo de nuevo.",
      );
      return;
    }
    // Full load: the cookie has just changed and /onboarding resolves it server-side.
    window.location.assign("/onboarding");
  }

  return (
    <>
      {formError && (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{formError}</p>
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="nombre@empresa.cl"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          {errors.email && <p className="text-sm text-danger">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-sm text-ink-3 underline-offset-4 hover:text-ink hover:underline"
            >
              ¿Olvidó la contraseña?
            </button>
          </div>
          <Input
            id="password"
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
    </>
  );
}
