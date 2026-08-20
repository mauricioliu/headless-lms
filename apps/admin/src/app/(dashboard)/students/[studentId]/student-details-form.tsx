"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Field } from "@/components/forms/field";
import { SettingsSection } from "@/components/forms/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/http";
import type { Student } from "@/lib/api/types";

import { updateStudentAction } from "../actions";

const schema = z.object({
  firstName: z.string().trim().min(1, "Ingrese el nombre"),
  lastName: z.string().trim().min(1, "Ingrese el apellido"),
  email: z.email("Ingrese un correo válido"),
});

type FormValues = z.infer<typeof schema>;

// `name` is the composed display name and drifts once the person edits their
// own profile, so it can't be split back apart — the stored halves are the
// truth, and they are only null for someone who self-signed-up.
const valuesFor = (student: Student): FormValues => ({
  firstName: student.firstName ?? "",
  lastName: student.lastName ?? "",
  email: student.email,
});

export function StudentDetailsForm({ student }: { student: Student }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: valuesFor(student) });

  // The RSC re-renders with the saved row after `router.refresh()`; rebasing the
  // form on it is what clears `isDirty` and disables Save again.
  useEffect(() => {
    reset(valuesFor(student));
  }, [student, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      try {
        await updateStudentAction(student.id, values);
        toast.success("Datos del Trabajador actualizados");
        router.refresh();
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setError("email", { message: "Otra persona ya usa este correo" });
          return;
        }
        const status = err instanceof ApiError ? err.status : undefined;
        toast.error("No se pudo guardar", {
          description:
            status === 404
              ? "El Trabajador ya no existe."
              : status == null
                ? "No se pudo conectar con el servidor. Inténtelo de nuevo."
                : "Inténtelo de nuevo en un momento.",
        });
      }
    });
  });

  const emailPending = student.status === "invited";

  return (
    <form onSubmit={onSubmit}>
      <SettingsSection
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => reset(valuesFor(student))}
              disabled={pending || !isDirty}
            >
              Descartar
            </Button>
            <Button type="submit" variant="primary" disabled={pending || !isDirty}>
              {pending && <Loader2 className="animate-spin" />}
              Guardar cambios
            </Button>
          </>
        }
      >
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

        <Field
          id="email"
          label="Correo"
          required
          error={errors.email?.message}
          hint={
            emailPending
              ? "Cambiarlo deja sin efecto la invitación ya enviada. Reinvítielo para que llegue al correo nuevo."
              : "Es el correo con el que la persona inicia sesión."
          }
        >
          <Input id="email" type="email" aria-invalid={!!errors.email} {...register("email")} />
        </Field>
      </SettingsSection>
    </form>
  );
}
