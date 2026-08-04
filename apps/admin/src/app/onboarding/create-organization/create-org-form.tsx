"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createOrganizationAction } from "@/lib/auth/actions";
import { uniqueOrgSlug } from "@/lib/slug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";

const schema = z.object({
  name: z.string().min(2, "Give your organization a name"),
});
type Values = z.infer<typeof schema>;

export function CreateOrgForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "" } });

  async function onSubmit(values: Values) {
    try {
      // The API makes the new org the session's active org server-side.
      await createOrganizationAction({ name: values.name, slug: uniqueOrgSlug(values.name) });
    } catch (e) {
      toast.error("Couldn't create organization", {
        description: e instanceof Error ? e.message : undefined,
      });
      return;
    }
    window.location.assign("/onboarding");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-5 flex flex-col gap-4" noValidate>
      <Field id="org-name" label="Organization name" error={errors.name?.message} required>
        <Input id="org-name" placeholder="Your organization" {...register("name")} />
      </Field>
      <Button type="submit" variant="primary" disabled={isSubmitting} className="w-full">
        {isSubmitting && <Loader2 className="animate-spin" />}
        Create organization
      </Button>
    </form>
  );
}
