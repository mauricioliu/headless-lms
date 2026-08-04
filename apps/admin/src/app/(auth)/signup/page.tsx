import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create an account — Headless LMS Management" };

export default async function SignupPage() {
  const session = await getServerSession();
  if (session) redirect("/onboarding");

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink text-balance">
          Create your account
        </h1>
        <p className="text-sm text-ink-3 text-pretty">
          Set up your credentials. You&apos;ll pick or create an organization next.
        </p>
      </div>
      <SignupForm />
      <p className="mt-6 text-center text-sm text-ink-3">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
