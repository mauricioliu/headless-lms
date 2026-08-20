"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z
  .object({
    password: z.string().min(8, "Use al menos 8 caracteres"),
    confirm: z.string().min(8, "Confirme la contraseña"),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });
type Values = z.infer<typeof schema>;

/** Set-password landing for the reset mail's staff readers. Errors map by
 *  status at the call-site; a consumed or expired token (400) is the same
 *  state as arriving without one. */
export function SetPasswordView({ token }: { token: string | null }) {
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    const { error } = await authClient.resetPassword({
      newPassword: values.password,
      token: token ?? "",
    });
    if (error) {
      setFormError(
        error.status === 400
          ? "El enlace expiró o ya se usó. Solicite uno nuevo desde el inicio de sesión."
          : "No se pudo guardar la contraseña. Inténtelo de nuevo.",
      );
      return;
    }
    setDone(true);
  }

  if (!token) {
    return (
      <InvalidToken
        message="El enlace expiró o ya se usó. Solicite uno nuevo desde el inicio de sesión."
      />
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="grid size-10 place-items-center rounded-full bg-surface-2 text-brand">
            <ShieldCheck className="size-5" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            Contraseña restablecida
          </h1>
          <p className="text-sm text-ink-3 text-pretty">
            La nueva contraseña quedó guardada. Entre al panel con ella.
          </p>
          <Button variant="primary" className="mt-2 w-full" asChild>
            <Link href="/login">Ir a iniciar sesión</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink text-balance">
          Elegir contraseña nueva
        </h1>
        <p className="text-sm text-ink-3 text-pretty">
          Elija la contraseña para entrar al panel de administración.
        </p>
      </div>
      {formError && (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{formError}</p>
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Contraseña nueva</Label>
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm">Confirmar contraseña</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            aria-invalid={!!errors.confirm}
            {...register("confirm")}
          />
          {errors.confirm && <p className="text-sm text-danger">{errors.confirm.message}</p>}
        </div>
        <Button type="submit" variant="primary" disabled={isSubmitting} className="mt-1 w-full">
          {isSubmitting && <Loader2 className="animate-spin" />}
          Guardar contraseña
        </Button>
      </form>
    </Shell>
  );
}

function InvalidToken({ message }: { message: string }) {
  return (
    <Shell>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-ink">Enlace no válido</h1>
        <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{message}</p>
        </div>
        <Button variant="secondary" className="mt-4 w-full" asChild>
          <Link href="/login">Ir a iniciar sesión</Link>
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-card border border-line bg-surface p-6">{children}</div>
      </div>
    </div>
  );
}
