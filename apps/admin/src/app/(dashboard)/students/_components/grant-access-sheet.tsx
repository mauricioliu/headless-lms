"use client";

import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormSheet } from "@/components/forms/form-sheet";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { grantEntitlementAction } from "../../entitlements/actions";

const FORM_ID = "student-grant-access-form";

export type LiteContent = { id: string; title: string; type: "course" | "download" };

const schema = z
  .object({
    contentId: z.string().min(1, "Select a course or download"),
    expiryMode: z.enum(["never", "date"]),
    expiresAt: z.string().optional(),
  })
  .refine((d) => d.expiryMode === "never" || (!!d.expiresAt && d.expiresAt.length > 0), {
    message: "Pick an expiry date",
    path: ["expiresAt"],
  });

type FormValues = z.infer<typeof schema>;

export function GrantAccessSheet({
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
  const [pending, startTransition] = React.useTransition();

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

  React.useEffect(() => {
    if (open) reset({ contentId: "", expiryMode: "never", expiresAt: "" });
  }, [open, reset]);

  const expiryMode = useWatch({ control, name: "expiryMode" });

  const courses = content.filter((c) => c.type === "course");
  const downloads = content.filter((c) => c.type === "download");

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
        toast.success("Access granted");
        onOpenChange(false);
      } catch (err) {
        toast.error("Couldn't grant access", { description: (err as Error).message });
      }
    });
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Grant access"
      description="Grant this student access to a course or download. They'll get immediate access."
      formId={FORM_ID}
      submitLabel="Grant access"
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Controller
          control={control}
          name="contentId"
          render={({ field }) => (
            <Field id="contentId" label="Content" required error={errors.contentId?.message}>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="contentId" aria-invalid={!!errors.contentId}>
                  <SelectValue placeholder="Select a course or download" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Courses</SelectLabel>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Downloads</SelectLabel>
                    {downloads.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="expiryMode"
          render={({ field }) => (
            <Field
              id="expiryMode"
              label="Access expiry"
              hint="Lifetime access never expires; set a date to time-box this entitlement."
            >
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="expiryMode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never expires</SelectItem>
                  <SelectItem value="date">Expires on a date</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
        />

        {expiryMode === "date" ? (
          <Field id="expiresAt" label="Expiry date" required error={errors.expiresAt?.message}>
            <Input
              id="expiresAt"
              type="date"
              aria-invalid={!!errors.expiresAt}
              {...register("expiresAt")}
            />
          </Field>
        ) : null}
      </form>
    </FormSheet>
  );
}
