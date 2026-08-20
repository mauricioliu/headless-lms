"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.string().min(1, "El correo es obligatorio").email("Ingrese un correo válido"),
});
type Values = z.infer<typeof schema>;

/** Requests the password-reset mail. The confirmation is deliberately generic
 *  for every outcome the API can answer — a known and an unknown address must
 *  be indistinguishable (no account enumeration). Only a transport failure
 *  says something different. */
export function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    const { error } = await authClient.requestPasswordReset({ email: values.email });
    // Any answered request — success or API error — confirms the same way.
    if (error && error.status == null) {
      setFormError("No se pudo enviar el enlace. Inténtelo de nuevo.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="grid size-10 place-items-center rounded-full bg-surface-2 text-brand">
          <MailCheck className="size-5" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-ink">Revise el correo</h1>
        <p className="text-sm text-ink-3 text-pretty">
          Si el correo está registrado, llegó un enlace para restablecer la contraseña. El enlace
          expira pronto.
        </p>
        <Button variant="ghost" size="sm" onClick={onBack} className="mt-2">
          <ArrowLeft />
          Volver a iniciar sesión
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink text-balance">
          Restablecer contraseña
        </h1>
        <p className="text-sm text-ink-3 text-pretty">
          Se enviará un enlace para elegir una contraseña nueva.
        </p>
      </div>
      {formError && (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <p>{formError}</p>
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="forgot-email">Correo</Label>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            placeholder="nombre@empresa.cl"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          {errors.email && <p className="text-sm text-danger">{errors.email.message}</p>}
        </div>
        <Button type="submit" variant="primary" disabled={isSubmitting} className="mt-1 w-full">
          {isSubmitting && <Loader2 className="animate-spin" />}
          Enviar enlace
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft />
          Volver a iniciar sesión
        </Button>
      </form>
    </>
  );
}
