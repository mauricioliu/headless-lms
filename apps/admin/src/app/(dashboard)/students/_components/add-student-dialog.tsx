"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { Field } from "@/components/forms/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/http";

import { addStudentAction } from "../actions";

const FORM_ID = "add-student-form";

// The name columns are nullable for people who arrive by self-signup, not so an
// admin can skip them — someone adding a Trabajador knows who they are.
const schema = z.object({
  firstName: z.string().trim().min(1, "Ingrese el nombre"),
  lastName: z.string().trim().min(1, "Ingrese el apellido"),
  email: z.email("Ingrese un correo válido"),
  sendEmail: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = { firstName: "", lastName: "", email: "", sendEmail: true };

export function AddStudentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });

  // Reset to a clean slate every time the dialog opens.
  useEffect(() => {
    if (open) reset(DEFAULTS);
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      try {
        await addStudentAction(values);
        toast.success(values.sendEmail ? "Invitación enviada" : "Trabajador agregado", {
          description: values.email,
        });
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setError("email", { message: "Esta persona ya pertenece a la organización" });
          return;
        }
        const status = err instanceof ApiError ? err.status : undefined;
        toast.error("No se pudo agregar al Trabajador", {
          description:
            status == null
              ? "No se pudo conectar con el servidor. Inténtelo de nuevo."
              : "Inténtelo de nuevo en un momento.",
        });
      }
    });
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Agregar Trabajador"
      description="El Trabajador queda en la organización de inmediato; la invitación envía por correo un enlace de un solo uso para crear su cuenta."
      formId={FORM_ID}
      submitLabel="Agregar Trabajador"
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="firstName" label="Nombre" required error={errors.firstName?.message}>
            <Input
              id="firstName"
              autoComplete="given-name"
              aria-invalid={!!errors.firstName}
              {...register("firstName")}
            />
          </Field>
          <Field id="lastName" label="Apellido" required error={errors.lastName?.message}>
            <Input
              id="lastName"
              autoComplete="family-name"
              aria-invalid={!!errors.lastName}
              {...register("lastName")}
            />
          </Field>
        </div>

        <Field id="email" label="Correo" required error={errors.email?.message}>
          <Input id="email" type="email" aria-invalid={!!errors.email} {...register("email")} />
        </Field>

        <label htmlFor="sendEmail" className="flex items-center gap-2.5 text-sm text-ink-2">
          <Checkbox id="sendEmail" {...register("sendEmail")} />
          Enviar invitación por correo
        </label>
      </form>
    </FormDialog>
  );
}
