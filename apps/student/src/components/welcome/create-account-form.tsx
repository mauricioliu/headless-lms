"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "@/lib/auth/client";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name"),
  password: z.string().min(8, "Use at least 8 characters"),
});

type Values = z.infer<typeof schema>;

/** Signals that the email already has an account, so the caller can offer sign-in. */
export type CreateAccountOutcome = "created" | "account-exists";

export function CreateAccountForm({
  email,
  name = "",
  onOutcome,
}: {
  email: string;
  /** The name on their record, if an admin added them. Editable — they get the
   *  last word on what they are called. */
  name?: string;
  /** Resolves to an error message when the follow-up accept fails, else null. */
  onOutcome: (outcome: CreateAccountOutcome) => Promise<string | null>;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name, password: "" },
  });

  async function onSubmit(values: Values) {
    setError(null);
    const { error: authError } = await signUp.email({
      email,
      password: values.password,
      name: values.name,
    });

    if (authError) {
      if (isAlreadyRegistered(authError)) {
        await onOutcome("account-exists");
        return;
      }
      setError(authError.message ?? "Couldn't create your account.");
      return;
    }

    const failure = await onOutcome("created");
    if (failure) setError(failure);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
        {error && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input autoComplete="name" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <ReadOnlyEmail id="signup-email" email={email} />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          variant="brand"
          className="mt-1 w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          Accept invitation
        </Button>
      </form>
    </Form>
  );
}

/** The invited address is fixed by the invitation — shown, never edited. */
export function ReadOnlyEmail({ id, email }: { id: string; email: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Email</Label>
      <Input id={id} type="email" value={email} readOnly tabIndex={-1} />
    </div>
  );
}

/** Better Auth refuses a second signup for a known address. */
function isAlreadyRegistered(error: { code?: string; status?: number }): boolean {
  return error.code?.startsWith("USER_ALREADY_EXISTS") === true || error.status === 422;
}
