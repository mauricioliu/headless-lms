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
import { signIn } from "@/lib/auth/client";
import { ReadOnlyEmail } from "./create-account-form";

const schema = z.object({ password: z.string().min(1, "Enter your password") });
type Values = z.infer<typeof schema>;

export function SignInForm({
  email,
  /** Resolves to an error message when the follow-up accept fails, else null. */
  onSignedIn,
}: {
  email: string;
  onSignedIn: () => Promise<string | null>;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "" },
  });

  async function onSubmit(values: Values) {
    setError(null);
    const { error: authError } = await signIn.email({ email, password: values.password });
    if (authError) {
      setError(authError.message ?? "Invalid email or password.");
      return;
    }
    const failure = await onSignedIn();
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

        <ReadOnlyEmail id="signin-email" email={email} />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  autoFocus
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
          Sign in and accept
        </Button>
      </form>
    </Form>
  );
}
