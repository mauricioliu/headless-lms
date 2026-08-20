"use client";

import { useEffect, useMemo, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { ApiError } from "@/lib/api/http";

import { grantEntitlementAction } from "../../entitlements/actions";

const FORM_ID = "student-grant-access-form";

export type LiteContent = { id: string; title: string; type: "course" | "download" };

const schema = z
  .object({
    contentId: z.string().min(1, "Seleccione un curso o material"),
    expiryMode: z.enum(["never", "date"]),
    expiresAt: z.string().optional(),
  })
  .refine((d) => d.expiryMode === "never" || (!!d.expiresAt && d.expiresAt.length > 0), {
    message: "Elija una fecha de expiración",
    path: ["expiresAt"],
  });

type FormValues = z.infer<typeof schema>;

export function GrantAccessDialog({
  open,
  onOpenChange,
  studentId,
  content,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  content: LiteContent[];
}) {
  const [pending, startTransition] = useTransition();

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { contentId: "", expiryMode: "never", expiresAt: "" },
  });

  useEffect(() => {
    if (open) reset({ contentId: "", expiryMode: "never", expiresAt: "" });
  }, [open, reset]);

  const expiryMode = useWatch({ control, name: "expiryMode" });

  const contentOptions = useMemo(
    () =>
      content.map((c) => ({
        value: c.id,
        label: c.title,
        group: c.type === "course" ? "Cursos" : "Materiales",
      })),
    [content],
  );

  const onSubmit = handleSubmit((values) => {
    const input = {
      orgUserId: studentId,
      contentId: values.contentId,
      expiresAt:
        values.expiryMode === "never" || !values.expiresAt
          ? null
          : new Date(values.expiresAt).toISOString(),
    };
    startTransition(async () => {
      try {
        await grantEntitlementAction(input);
        toast.success("Acceso concedido");
        onOpenChange(false);
      } catch (err) {
        const status = err instanceof ApiError ? err.status : undefined;
        toast.error("No se pudo dar acceso", {
          description:
            status === 404
              ? "El curso o material ya no existe."
              : status === 409
                ? "El Trabajador ya tiene acceso a este contenido."
                : "Inténtelo de nuevo en un momento.",
        });
      }
    });
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Dar acceso"
      description="Se concede acceso a un curso o material; el Trabajador lo ve de inmediato."
      formId={FORM_ID}
      submitLabel="Dar acceso"
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Controller
          control={control}
          name="contentId"
          render={({ field }) => (
            <Field id="contentId" label="Contenido" required error={errors.contentId?.message}>
              <Combobox
                id="contentId"
                value={field.value}
                onValueChange={field.onChange}
                options={contentOptions}
                placeholder="Seleccione un curso o material"
                searchPlaceholder="Buscar cursos y materiales…"
                emptyText="Nada coincide"
                aria-invalid={!!errors.contentId}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="expiryMode"
          render={({ field }) => (
            <Field
              id="expiryMode"
              label="Expiración del acceso"
              hint="El acceso permanente no expira; con una fecha se acota hasta ese día."
            >
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="expiryMode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Nunca expira</SelectItem>
                  <SelectItem value="date">Expira en una fecha</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
        />

        {expiryMode === "date" ? (
          <Field id="expiresAt" label="Fecha de expiración" required error={errors.expiresAt?.message}>
            <Input
              id="expiresAt"
              type="date"
              aria-invalid={!!errors.expiresAt}
              {...register("expiresAt")}
            />
          </Field>
        ) : null}
      </form>
    </FormDialog>
  );
}
