# Admin Auth Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the admin app's combined login/signup component into separate `/login` and `/signup` pages, and make `/onboarding` the single server-side decision point that routes a signed-in user to the dashboard, an organization picker, or organization creation.

**Architecture:** `/login` and `/signup` collect credentials and nothing else, then hand off to `/onboarding` with a full page load. `/onboarding` is a Server Component that resolves the session and redirects — three routable states go to three destinations, and anything else renders a client component that signs the user out and returns them to `/login`. Organization writes go back to `/onboarding` rather than to the dashboard, so the decision point re-resolves the session instead of trusting that the write landed.

**Tech Stack:** Next.js 16 App Router (`apps/admin`), better-auth client (`lib/auth/client.ts`), react-hook-form + zod, Tailwind with the project's semantic tokens (`bg-surface`, `text-ink`, `border-line`, …).

**Spec:** `docs/superpowers/specs/2026-08-04-admin-auth-split-design.md`

## Global Constraints

- No routing decision may read a query parameter. Every branch comes from the session as `getServerSession()` resolves it.
- Nothing server-side may write or relay a `Set-Cookie`. Auth mutations (`signIn`, `signUp`, `signOut`, `organization.setActive`) run in the browser against the API, which is how `signIn` already works in this app.
- Navigation after a successful auth or organization write is `window.location.assign(...)`, never `router.replace(...)`. The session cookie has just changed and the destination is a Server Component that must see it.
- `(auth)` is a route group: the URL stays `/login`. Existing `redirect("/login")` calls elsewhere keep working and must not be renamed.
- The admin app has no component test runner. Per-task verification is `pnpm --filter admin typecheck`, `pnpm --filter admin lint`, and the browser walk stated in the task. Do not add test files or a test harness.
- Run all commands from the repo root: `/Users/mdwt/dev/headless-lms/headless-lms`.
- To exercise anything in a browser you need both servers: `pnpm --filter api dev` (port 8000) and `pnpm --filter admin dev` (port 8001).
- Comments: only where genuinely necessary, one or two short lines. The comment text in this plan's code blocks is the intended final text — copy it as written, don't expand on it.

---

## File Structure

**Created**

| File | Responsibility |
| --- | --- |
| `apps/admin/src/app/(auth)/layout.tsx` | Split-screen shell shared by login and signup |
| `apps/admin/src/app/(auth)/login/page.tsx` | Server: bounce a signed-in session, render heading + form |
| `apps/admin/src/app/(auth)/login/login-form.tsx` | Client: email + password |
| `apps/admin/src/app/(auth)/signup/page.tsx` | Server: bounce a signed-in session, render heading + form |
| `apps/admin/src/app/(auth)/signup/signup-form.tsx` | Client: name + email + password |
| `apps/admin/src/app/onboarding/layout.tsx` | Centered card shell + logo + sign-out |
| `apps/admin/src/app/onboarding/sign-out-link.tsx` | Client: sign out from the onboarding shell |
| `apps/admin/src/app/onboarding/session-reset.tsx` | Client: sign out an unroutable session, return to `/login` |
| `apps/admin/src/app/onboarding/select-organization/page.tsx` | Server: gate on `no-active-org`, list orgs |
| `apps/admin/src/app/onboarding/select-organization/org-picker.tsx` | Client: `setActive` |
| `apps/admin/src/app/onboarding/create-organization/page.tsx` | Server: gate on `no-organization` |
| `apps/admin/src/app/onboarding/create-organization/create-org-form.tsx` | Client: create the org |

**Modified**

| File | Change |
| --- | --- |
| `apps/admin/src/lib/auth/server-session.ts` | `ServerSession.organizations`; `require*` redirects |
| `apps/admin/src/app/onboarding/page.tsx` | Becomes the decision point |
| `apps/admin/src/app/(dashboard)/layout.tsx` | Gate collapses to two lines |
| `apps/admin/src/proxy.ts` | Drop `?next=`; exclude `signup` and `invite` |
| `apps/admin/src/lib/auth/client.ts` | Stale comment about `useSession` on the login page |

**Deleted**

`apps/admin/src/app/login/page.tsx`, `apps/admin/src/app/login/login-view.tsx`, `apps/admin/src/app/onboarding/onboarding-view.tsx`, `apps/admin/src/lib/auth/org-activator.tsx`

---

## Task 1: Carry the organization list on the session

`getServerSession` already fetches `organization/list` and throws the result away after a length check. The picker page needs that list, and refetching it would be a second round-trip for data the resolver has in hand.

**Files:**
- Modify: `apps/admin/src/lib/auth/server-session.ts:29-35` (the `ServerSession` type), `:60-115` (the resolver body)

**Interfaces:**
- Consumes: nothing
- Produces: `ServerSession.organizations: { id: string; name: string; slug: string }[]` — populated whenever `status` is `no-active-org`, empty otherwise. Read by Task 2's `select-organization/page.tsx`.

- [ ] **Step 1: Add the field to the type**

In `apps/admin/src/lib/auth/server-session.ts`, replace the `ServerSession` type:

```ts
export type ServerSession = {
  user: SessionPerson;
  organization: { id: string; name: string; slug: string } | null;
  /** Every org the user is a member of. Populated when no org is active yet. */
  organizations: { id: string; name: string; slug: string }[];
  role: ServerRole;
  status: "authenticated" | "no-organization" | "no-active-org" | "denied";
};
```

- [ ] **Step 2: Declare the accumulator**

Find this block in `getServerSession`:

```ts
  let role: ServerRole | null = null;
  let organization: ServerSession["organization"] = null;
  let status: ServerSession["status"] = "no-organization";
```

Add a fourth declaration under it:

```ts
  let organizations: ServerSession["organizations"] = [];
```

- [ ] **Step 3: Keep the list instead of discarding it**

Replace the whole `if (status !== "authenticated") { … }` block with:

```ts
  if (status !== "authenticated") {
    // Valid cookie but no usable active org + staff membership. Distinguish:
    //  - member of ≥1 org, none active → the picker can offer them
    //  - no memberships, but the session carries a stamped org → a student
    //    (or otherwise non-staff) cookie: deny
    //  - no memberships, nothing stamped → fresh staff signup, prompt to create
    const listRes = await fetch(`${API_URL}/api/auth/organization/list`, {
      headers: { cookie },
      cache: "no-store",
    });
    const raw = listRes.ok ? ((await listRes.json()) as unknown) : [];
    organizations = Array.isArray(raw)
      ? raw
          .filter(
            (o): o is { id: string; name?: string; slug?: string } =>
              !!o && typeof o === "object" && typeof (o as { id?: unknown }).id === "string",
          )
          .map((o) => ({ id: o.id, name: o.name ?? "", slug: o.slug ?? "" }))
      : [];
    status = organizations.length > 0 ? "no-active-org" : activeOrgId ? "denied" : "no-organization";
    organization = null;
  }
```

- [ ] **Step 4: Return it**

Replace the `return` at the end of `getServerSession`:

```ts
  return {
    user: {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      image: data.user.image ?? null,
    },
    organization,
    organizations,
    role: role ?? "instructor",
    status,
  };
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter admin typecheck`
Expected: passes. If it reports a missing `organizations` property anywhere, a call site is constructing a `ServerSession` literal — add `organizations: []` there.

- [ ] **Step 6: Lint**

Run: `pnpm --filter admin lint`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/lib/auth/server-session.ts
git commit -m "feat(admin): keep the org list on the resolved server session"
```

---

## Task 2: Build the onboarding segment

The whole segment lands at once: the decision point redirects to its two children, so shipping it in pieces would leave a route redirecting to a 404.

**Files:**
- Create: `apps/admin/src/app/onboarding/layout.tsx`, `sign-out-link.tsx`, `session-reset.tsx`, `select-organization/page.tsx`, `select-organization/org-picker.tsx`, `create-organization/page.tsx`, `create-organization/create-org-form.tsx`
- Modify: `apps/admin/src/app/onboarding/page.tsx` (full rewrite)
- Delete: `apps/admin/src/app/onboarding/onboarding-view.tsx`

**Interfaces:**
- Consumes: `getServerSession(): Promise<ServerSession | null>` and `ServerSession.organizations` from Task 1; `createOrganizationAction({ name, slug }): Promise<Organization>` from `@/lib/auth/actions` (already exists, unchanged); `uniqueOrgSlug(name): string` from `@/lib/slug` (already exists).
- Produces: routes `/onboarding`, `/onboarding/select-organization`, `/onboarding/create-organization`. Task 3 and Task 4 redirect to `/onboarding`.

- [ ] **Step 1: Create the shell layout**

Create `apps/admin/src/app/onboarding/layout.tsx`:

```tsx
import type { ReactNode } from "react";

import { Logo } from "@/components/app-shell/logo";
import { SignOutLink } from "./sign-out-link";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo org="Headless LMS" />
        </div>
        <div className="mt-6 rounded-card border border-line bg-surface p-6">{children}</div>
        <SignOutLink />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the sign-out link**

Create `apps/admin/src/app/onboarding/sign-out-link.tsx`:

```tsx
"use client";

import { signOut } from "@/lib/auth/client";

export function SignOutLink() {
  return (
    <button
      type="button"
      onClick={() => void signOut().finally(() => window.location.assign("/login"))}
      className="mx-auto mt-4 block text-sm text-ink-3 underline-offset-4 hover:text-ink hover:underline"
    >
      Sign out
    </button>
  );
}
```

- [ ] **Step 3: Create the session reset**

Create `apps/admin/src/app/onboarding/session-reset.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

import { signOut } from "@/lib/auth/client";

// Reached when the session cannot be routed: no cookie, a rejected cookie, or a
// valid cookie carrying no staff role. Clearing it is what stops /login from
// sending the same unusable session straight back here.
export function SessionReset() {
  const started = useRef(false);

  useEffect(() => {
    // Strict-mode double-mount fires this twice; the sign-out must run once.
    if (started.current) return;
    started.current = true;
    void signOut().finally(() => window.location.assign("/login"));
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Loader2 className="size-5 animate-spin text-brand" />
      <p className="text-sm text-ink-3">Signing you out…</p>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite the decision point**

Replace the entire contents of `apps/admin/src/app/onboarding/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { SessionReset } from "./session-reset";

export const metadata: Metadata = { title: "Setting up — Headless LMS" };

// The single decision point after authentication. It resolves the session and
// sends the user to the one thing they need to do next. A session it cannot
// route is one that has to be re-established, so it is cleared, not bounced.
export default async function OnboardingPage() {
  const session = await getServerSession();
  if (session?.status === "authenticated") redirect("/");
  if (session?.status === "no-active-org") redirect("/onboarding/select-organization");
  if (session?.status === "no-organization") redirect("/onboarding/create-organization");
  return <SessionReset />;
}
```

- [ ] **Step 5: Create the organization picker page**

Create `apps/admin/src/app/onboarding/select-organization/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { OrgPicker } from "./org-picker";

export const metadata: Metadata = { title: "Choose an organization — Headless LMS" };

export default async function SelectOrganizationPage() {
  const session = await getServerSession();
  // This page serves one state; every other one is /onboarding's to route.
  if (session?.status !== "no-active-org") redirect("/onboarding");

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-ink">Choose an organization</h1>
        <p className="text-sm text-ink-3 text-pretty">
          You belong to more than one. Pick the one you want to work in — you can switch later.
        </p>
      </div>
      <OrgPicker organizations={session.organizations} />
    </>
  );
}
```

- [ ] **Step 6: Create the picker component**

Create `apps/admin/src/app/onboarding/select-organization/org-picker.tsx`:

```tsx
"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { authClient } from "@/lib/auth/client";

type Org = { id: string; name: string; slug: string };

export function OrgPicker({ organizations }: { organizations: Org[] }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(organizationId: string) {
    setError(null);
    setPending(organizationId);
    const { error: failure } = await authClient.organization.setActive({ organizationId });
    if (failure) {
      setPending(null);
      setError(failure.message ?? "Couldn't switch to that organization");
      return;
    }
    // Back to the decision point, not straight to the dashboard: it re-resolves
    // the session and routes on what actually landed.
    window.location.assign("/onboarding");
  }

  return (
    <div className="mt-5 flex flex-col gap-2">
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}
      {organizations.map((org) => (
        <button
          key={org.id}
          type="button"
          disabled={pending !== null}
          onClick={() => void choose(org.id)}
          className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 text-left hover:bg-surface-2 disabled:opacity-60"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-ink">{org.name}</span>
            <span className="truncate text-xs text-ink-4">{org.slug}</span>
          </span>
          {pending === org.id && <Loader2 className="size-4 shrink-0 animate-spin text-ink-3" />}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Create the org-creation page**

Create `apps/admin/src/app/onboarding/create-organization/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { CreateOrgForm } from "./create-org-form";

export const metadata: Metadata = { title: "Create your organization — Headless LMS" };

export default async function CreateOrganizationPage() {
  const session = await getServerSession();
  // This page serves one state; every other one is /onboarding's to route.
  if (session?.status !== "no-organization") redirect("/onboarding");

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-ink">Create your organization</h1>
        <p className="text-sm text-ink-3 text-pretty">
          You&apos;re signed in but not part of an organization yet. Create one to get started —
          you&apos;ll be its owner.
        </p>
      </div>
      <CreateOrgForm />
    </>
  );
}
```

- [ ] **Step 8: Create the org-creation form**

Create `apps/admin/src/app/onboarding/create-organization/create-org-form.tsx`:

```tsx
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
```

- [ ] **Step 9: Delete the old view**

```bash
rm apps/admin/src/app/onboarding/onboarding-view.tsx
```

- [ ] **Step 10: Typecheck and lint**

Run: `pnpm --filter admin typecheck && pnpm --filter admin lint`
Expected: both pass. Nothing should still import `onboarding-view`.

- [ ] **Step 11: Verify in the browser**

Start `pnpm --filter api dev` and `pnpm --filter admin dev`. Sign in with any existing account that has an organization, then:

1. Open `http://localhost:8001/onboarding`. Expected: straight to `/`, no card shown.
2. Open `http://localhost:8001/onboarding/create-organization`. Expected: bounces to `/onboarding` and on to `/` — the page refuses a state that isn't its own.
3. Open `http://localhost:8001/onboarding/select-organization`. Expected: same bounce.

The create and pick flows themselves need a no-organization and a multi-organization account, which are easiest to reach once signup is split — they are walked end to end in Task 4 Step 6.

- [ ] **Step 12: Commit**

```bash
git add apps/admin/src/app/onboarding
git commit -m "feat(admin): make /onboarding the post-auth decision point"
```

---

## Task 3: Split login and signup into separate pages

**Files:**
- Create: `apps/admin/src/app/(auth)/layout.tsx`, `(auth)/login/page.tsx`, `(auth)/login/login-form.tsx`, `(auth)/signup/page.tsx`, `(auth)/signup/signup-form.tsx`
- Modify: `apps/admin/src/proxy.ts`, `apps/admin/src/lib/auth/client.ts:9`
- Delete: `apps/admin/src/app/login/page.tsx`, `apps/admin/src/app/login/login-view.tsx`

**Interfaces:**
- Consumes: `getServerSession()` from `@/lib/auth/server-session`; `signIn`, `signUp` from `@/lib/auth/client`; `/onboarding` from Task 2.
- Produces: routes `/login` and `/signup`. `(auth)` is a route group and contributes no URL segment.

- [ ] **Step 1: Delete the combined view first**

Doing this before writing the new pages guarantees a route collision can't hide: `app/login/page.tsx` and `app/(auth)/login/page.tsx` both resolve to `/login`, and Next fails the build if both exist.

```bash
rm -r apps/admin/src/app/login
```

- [ ] **Step 2: Create the shared shell**

Create `apps/admin/src/app/(auth)/layout.tsx`:

```tsx
import type { ReactNode } from "react";

import { Logo } from "@/components/app-shell/logo";

// Shared by /login and /signup: the form on a solid surface column, a calm dark
// panel beside it from `lg:` up. Each page supplies only its heading, its form,
// and the link to the other one.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col bg-surface">
        <div className="flex h-16 items-center px-6 sm:px-10">
          <Logo org="Headless LMS" />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-xs">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <blockquote className="max-w-md">
            <p className="text-2xl font-medium tracking-tight text-surface text-balance">
              Everything your team needs to run courses — content and entitlements in one calm
              place.
            </p>
            <footer className="mt-4 text-sm text-surface/60">
              Headless LMS · Management dashboard
            </footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the login page**

Create `apps/admin/src/app/(auth)/login/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in — Headless LMS Management" };

// Any session at all goes to /onboarding — including one that turns out to be
// unusable, which /onboarding clears. That leaves this page one job: credentials.
export default async function LoginPage() {
  const session = await getServerSession();
  if (session) redirect("/onboarding");

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink text-balance">
          Sign in to manage
        </h1>
        <p className="text-sm text-ink-3 text-pretty">
          Welcome back. Enter your credentials to access the back office.
        </p>
      </div>
      <LoginForm />
      <p className="mt-6 text-center text-sm text-ink-3">
        New here?{" "}
        <Link href="/signup" className="font-medium text-brand underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
```

- [ ] **Step 4: Create the login form**

Create `apps/admin/src/app/(auth)/login/login-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Loader2 } from "lucide-react";

import { signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    const { error } = await signIn.email(values);
    if (error) {
      setFormError(error.message ?? "Invalid email or password");
      return;
    }
    // Full load: the cookie has just changed and /onboarding resolves it server-side.
    window.location.assign("/onboarding");
  }

  return (
    <>
      {formError && (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{formError}</p>
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          {errors.email && <p className="text-sm text-danger">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <a
              href="#"
              className="text-sm text-ink-3 underline-offset-4 hover:text-ink hover:underline"
            >
              Forgot?
            </a>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          {errors.password && <p className="text-sm text-danger">{errors.password.message}</p>}
        </div>
        <Button type="submit" variant="primary" disabled={isSubmitting} className="mt-1 w-full">
          {isSubmitting && <Loader2 className="animate-spin" />}
          Sign in
        </Button>
      </form>
    </>
  );
}
```

- [ ] **Step 5: Create the signup page**

Create `apps/admin/src/app/(auth)/signup/page.tsx`:

```tsx
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
```

- [ ] **Step 6: Create the signup form**

Create `apps/admin/src/app/(auth)/signup/signup-form.tsx`. Note there is no organization field — that is the point of the split.

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Loader2 } from "lucide-react";

import { signUp } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  name: z.string().min(2, "Your name is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
});
type Values = z.infer<typeof schema>;

export function SignupForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    const { error } = await signUp.email(values);
    if (error) {
      setFormError(error.message ?? "Couldn't create your account");
      return;
    }
    window.location.assign("/onboarding");
  }

  return (
    <>
      {formError && (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{formError}</p>
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register("name")} />
          {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          {errors.email && <p className="text-sm text-danger">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          {errors.password && <p className="text-sm text-danger">{errors.password.message}</p>}
        </div>
        <Button type="submit" variant="primary" disabled={isSubmitting} className="mt-1 w-full">
          {isSubmitting && <Loader2 className="animate-spin" />}
          Create account
        </Button>
      </form>
    </>
  );
}
```

- [ ] **Step 7: Fix the proxy**

`/signup` and `/invite` are matched by the current pattern, so a visitor with no cookie is bounced to `/login` and never reaches either. Replace the `proxy` function and `config` in `apps/admin/src/proxy.ts`:

```ts
export function proxy(req: NextRequest) {
  const hasSession = SESSION_COOKIE_HINTS.some((name) => req.cookies.has(name));
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Guard everything except the pages that exist to be reached without a
  // session, Next internals, and the (unused here) /api namespace.
  matcher: ["/((?!login|signup|invite|_next/static|_next/image|favicon.ico|api).*)"],
};
```

The file's leading doc comment stays as written — it describes the presence-only check, which is unchanged.

- [ ] **Step 8: Fix the stale comment in the auth client**

In `apps/admin/src/lib/auth/client.ts`, the block comment says the live `useSession` hook is "used on the login page". It no longer is. Replace that sentence with:

```
 * This is **browser-only**: sign-in/out/up and the org mutations. The dashboard
 * session/org/role is resolved on the server (`lib/auth/server-session.ts`) and
 * seeded into the client via `SessionProvider` — no client-side session
 * stitching here.
```

- [ ] **Step 9: Typecheck and lint**

Run: `pnpm --filter admin typecheck && pnpm --filter admin lint`
Expected: both pass, with no dangling import of `login-view`.

- [ ] **Step 10: Verify in the browser**

With both servers running and no session cookie:

1. `http://localhost:8001/login` — the sign-in form, two fields, "New here? Create an account".
2. Click through to `/signup` — three fields, **no organization field**.
3. Sign up a new email. Expected: lands on `/onboarding/create-organization`.
4. `http://localhost:8001/invite?token=x` with no cookie. Expected: the invite page's own "invalid invitation" state, **not** a bounce to `/login`.

- [ ] **Step 11: Commit**

```bash
git add apps/admin/src/app apps/admin/src/proxy.ts apps/admin/src/lib/auth/client.ts
git commit -m "feat(admin): split login and signup into separate pages"
```

---

## Task 4: Collapse the gates onto /onboarding

Three places still decide what a not-yet-ready session should see. `/onboarding` owns that now, so they each shrink to "no session → `/login`, not ready → `/onboarding`".

**Files:**
- Modify: `apps/admin/src/app/(dashboard)/layout.tsx:24-38`, `apps/admin/src/lib/auth/server-session.ts` (`requireOrgSession`, `requireAuth`, `requireManager`)
- Delete: `apps/admin/src/lib/auth/org-activator.tsx`

**Interfaces:**
- Consumes: `/onboarding` from Task 2.
- Produces: no new exports. `requireOrgSession`, `requireAuth` and `requireManager` keep their existing signatures and return types.

- [ ] **Step 1: Shrink the dashboard gate**

In `apps/admin/src/app/(dashboard)/layout.tsx`, replace the `DashboardLayout` function body and drop the now-unused `OrgActivator` and `canAccessDashboard` imports:

```tsx
// Server-side auth gate for the back office. Two outcomes only: no session at
// all goes to /login, and anything short of a resolved active org + staff role
// goes to /onboarding, which decides whether to route the user or reset them.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (session.status !== "authenticated") redirect("/onboarding");

  return (
    <SessionProvider session={session}>
      <AppShell user={session.user} organization={session.organization!} role={session.role}>
        {children}
      </AppShell>
    </SessionProvider>
  );
}
```

Leave `generateMetadata` above it untouched.

- [ ] **Step 2: Delete the org activator**

```bash
rm apps/admin/src/lib/auth/org-activator.tsx
```

- [ ] **Step 3: Retarget the three data-access gates**

In `apps/admin/src/lib/auth/server-session.ts`, replace the bodies of the three gates. Keep every doc comment above them, except the sentences that describe `/login?denied=1` — replace those with a note that an unusable session goes to `/onboarding`.

```ts
export async function requireOrgSession(): Promise<ServerSession> {
  const session = await getServerSession();
  if (!session) redirect("/login");
  // Valid cookie, no staff role — /onboarding clears it.
  if (session.status === "denied") redirect("/onboarding");
  return session;
}
```

```ts
export async function requireAuth(...pending: Promise<unknown>[]): Promise<AuthenticatedSession> {
  const session = await getServerSession();
  if (!session || session.status !== "authenticated" || !session.organization) {
    for (const p of pending) void p.catch(() => {});
    redirect(session ? "/onboarding" : "/login");
  }
  return session as AuthenticatedSession;
}
```

```ts
export async function requireManager(
  ...pending: Promise<unknown>[]
): Promise<AuthenticatedSession> {
  const session = await getServerSession();
  if (!session || session.status !== "authenticated" || !isManager(session.role)) {
    for (const p of pending) void p.catch(() => {});
    if (!session) redirect("/login");
    if (session.status !== "authenticated") redirect("/onboarding");
    notFound();
  }
  return session as AuthenticatedSession;
}
```

- [ ] **Step 4: Confirm nothing references the removed paths**

Run: `grep -rn -e "denied=1" -e "org-activator" -e "OrgActivator" -e "login-view" -e "onboarding-view" apps/admin/src`
Expected: no output.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter admin typecheck && pnpm --filter admin lint`
Expected: both pass. `canAccessDashboard` in `lib/roles.ts` no longer has a call site; leave the export in place — removing it is outside this change.

- [ ] **Step 6: Walk all four paths in the browser**

With both servers running:

1. **Fresh signup.** `/signup` → new email → `/onboarding/create-organization` → create → dashboard.
2. **Single-org login.** Sign out, sign in as that same user → dashboard directly, never pausing on onboarding. (The API stamps the active org at sign-in, so the session resolves as `authenticated`.)
3. **Multi-org login.** As a user in two organizations with none active, sign in → `/onboarding/select-organization` → pick one → dashboard showing that org's name in the title.
4. **Corrupted session.** With a student session cookie for the shared dev domain, open `http://localhost:8001/`. Expected: `/onboarding` → "Signing you out…" → `/login` with the form. It settles there — no bouncing between the two.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/app/\(dashboard\)/layout.tsx apps/admin/src/lib/auth/server-session.ts
git commit -m "refactor(admin): route every not-ready session through /onboarding"
```

---

## Done when

- `/login` and `/signup` are separate pages sharing `(auth)/layout.tsx`, and neither mentions organizations.
- `/onboarding` decides everything after authentication, reading no query parameter and writing no cookie.
- The four browser walks in Task 4 Step 6 all pass.
- `grep -rn "denied=1" apps/admin/src` returns nothing.
