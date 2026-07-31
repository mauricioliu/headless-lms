"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/http";
import type { Student } from "@/lib/api/types";

import { updateStudentAction } from "../actions";

const schema = z.object({
  firstName: z.string().trim().min(1, "Enter a first name"),
  lastName: z.string().trim().min(1, "Enter a last name"),
  email: z.email("Enter a valid email"),
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
  const [pending, startTransition] = React.useTransition();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: valuesFor(student) });

  // The RSC re-renders with the saved row after `router.refresh()`; rebasing the
  // form on it is what clears `isDirty` and disables Save again.
  React.useEffect(() => {
    reset(valuesFor(student));
  }, [student, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      try {
        await updateStudentAction(student.id, values);
        toast.success("Student updated");
        router.refresh();
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setError("email", { message: "Someone else already uses this email" });
          return;
        }
        toast.error("Couldn't save the student", { description: (err as Error).message });
      }
    });
  });

  const emailPending = student.status === "invited";

  return (
    <form onSubmit={onSubmit} className="flex flex-col rounded-card border border-line bg-surface">
      <div className="flex flex-col gap-5 px-6 py-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="firstName" label="First name" required error={errors.firstName?.message}>
            <Input
              id="firstName"
              autoComplete="given-name"
              aria-invalid={!!errors.firstName}
              {...register("firstName")}
            />
          </Field>
          <Field id="lastName" label="Last name" required error={errors.lastName?.message}>
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
          label="Email"
          required
          error={errors.email?.message}
          hint={
            emailPending
              ? "Changing this retires the invite already sent. Re-send it to reach the new address."
              : "This is the address they sign in with."
          }
        >
          <Input id="email" type="email" aria-invalid={!!errors.email} {...register("email")} />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => reset(valuesFor(student))}
          disabled={pending || !isDirty}
        >
          Discard
        </Button>
        <Button type="submit" variant="primary" disabled={pending || !isDirty}>
          {pending && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
      </div>
    </form>
  );
}
