# Admin auth split: separate login and signup, onboarding as the decision point

Date: 2026-08-04
App: `apps/admin`

## Problem

`app/login/login-view.tsx` is one component holding two forms behind a `mode`
state. It carries a `signInSchema` and a `signUpSchema`, two submit handlers, a
`busy` flag whose only job is to suppress a redirect effect while sign-up is
mid-flight, and a one-shot `useRef` guard against `useSession` re-emitting. The
sign-up handler creates the account, then creates the organization, then
swallows the org failure because the session is already live and there is
nowhere safe to stand.

Signing up and signing in are different operations with different inputs and
different outcomes. Merging them produced the state juggling above, and put
organization creation inside a form whose subject is the person.

## Design

Sign-up creates a person and nothing else. Everything about organizations moves
behind `/onboarding`, which resolves the session server-side and sends the user
to the one thing they need to do next.

### Routes

```
app/(auth)/layout.tsx                                   shared split-screen shell
app/(auth)/login/page.tsx                    server
app/(auth)/login/login-form.tsx              client
app/(auth)/signup/page.tsx                   server
app/(auth)/signup/signup-form.tsx            client

app/onboarding/layout.tsx                               centered card, logo, sign out
app/onboarding/page.tsx                      server     decides and redirects
app/onboarding/session-reset.tsx             client     signs out, returns to /login
app/onboarding/select-organization/page.tsx  server
app/onboarding/select-organization/org-picker.tsx       client
app/onboarding/create-organization/page.tsx  server
app/onboarding/create-organization/create-org-form.tsx  client
```

Deleted: `app/login/page.tsx`, `app/login/login-view.tsx`,
`app/onboarding/onboarding-view.tsx`, `lib/auth/org-activator.tsx`.

`(auth)` is a route group, so the URL stays `/login`. Every existing
`redirect("/login")` — in `server-session.ts`, `server-call.ts`, `user-menu.tsx`,
`account-view.tsx`, `proxy.ts` — keeps working untouched.

### Flow

```
/login    signIn.email({ email, password })   ──▶ location.assign("/onboarding")
/signup   signUp.email({ name, email, pass }) ──▶ location.assign("/onboarding")

/onboarding
    getServerSession()
      authenticated     → /
      no-active-org     → /onboarding/select-organization
      no-organization   → /onboarding/create-organization
      anything else     → <SessionReset/>: signOut() ──▶ /login

/onboarding/select-organization
    setActive(organizationId) ──▶ location.assign("/onboarding")

/onboarding/create-organization
    createOrganizationAction({ name, slug }) ──▶ location.assign("/onboarding")
```

Both writes return to `/onboarding` rather than to `/`. The decision point
re-resolves the session and routes on what is actually true, so a write that
half-succeeded lands the user on the step that is still outstanding instead of
on a dashboard that cannot render.

No decision anywhere in this flow reads a query parameter. Every branch comes
from the session as the server resolves it.

Navigation after a successful auth or org write is `window.location.assign`, not
`router.replace`. The session cookie has just changed; a full load is what makes
the server resolver see it.

### Session states

`/onboarding` recognises exactly three states. Each is a person who can be sent
somewhere useful:

| status | meaning | destination |
| --- | --- | --- |
| `authenticated` | active org resolved and a staff role held in it | `/` |
| `no-active-org` | member of 2+ orgs, none stamped active | `/onboarding/select-organization` |
| `no-organization` | no memberships | `/onboarding/create-organization` |

A user with exactly one organization never reaches `no-active-org`: the API's
`beforeCreateSession` hook stamps `activeOrganizationId` at sign-in, so they
resolve as `authenticated` and `/onboarding` passes them straight to `/`.

Everything else is a session that cannot be routed — no cookie, a rejected
cookie, or `denied` (a valid cookie carrying no staff role). Reaching
`/onboarding` in any of those states means the session is unusable, so
`/onboarding` renders `<SessionReset/>`, which calls `authClient.signOut()` and
sends the browser to `/login`. The cookie is gone by the time `/login` renders,
so it shows the sign-in form and there is nothing to loop on.

This is why `/login` needs no special case and no `?denied=1`. It redirects any
signed-in session to `/onboarding` unconditionally; if that session turns out to
be unusable, `/onboarding` clears it. Every other gate follows the same rule:
no session at all → `/login`; a session that will not resolve → `/onboarding`,
which decides whether to route the user or reset them.

`ServerSession` gains `organizations: { id, name, slug }[]`.
`getServerSession` already fetches `organization/list` (`server-session.ts:98`)
and discards it after a length check; retaining the array lets
`select-organization` render from the session it has already resolved.

### Pages

**`(auth)/layout.tsx`** — the split-screen shell from the current login view:
logo, form column on `bg-surface`, dark showcase panel on `lg:` and up. Login and
signup differ only in their heading, their form, and the link at the foot.

**`login-form.tsx`** — email and password. On error, an inline banner; the user
stays on the page. Foot link to `/signup`.

**`signup-form.tsx`** — name, email, password. `name` is what better-auth's
email sign-up requires; there is no organization field. Foot link to `/login`.

**`onboarding/layout.tsx`** — centered card on `bg-page`, logo above, sign-out
link below. Both onboarding pages render inside it.

**`onboarding/page.tsx`** — resolves the session and redirects. The only thing
it ever renders is `<SessionReset/>`, for a session it cannot route.

**`session-reset.tsx`** — calls `authClient.signOut()` on mount, then
`location.assign("/login")`. Shows "Signing you out…" while it runs. Sign-out
goes browser-to-API like `signIn` does, so better-auth clears its own cookie.

**`select-organization/page.tsx`** — renders `session.organizations` through
`org-picker.tsx`. The picker calls
`authClient.organization.setActive({ organizationId })` from the browser, the
same direct-to-API mechanism `signIn` and `signOut` already use, so better-auth
manages its own cookie and nothing server-side touches `Set-Cookie`.

**`create-organization/page.tsx`** — the form currently in `onboarding-view.tsx`,
unchanged in behaviour: `uniqueOrgSlug(name)`, then `createOrganizationAction`.

### Supporting changes

`proxy.ts` — stop appending `?next=`. Add `signup` and `invite` to the matcher
exclusion. The matcher today is `/((?!login|_next/static|_next/image|favicon.ico|api).*)`,
which matches `/invite`, so an invited user arriving without a cookie is bounced
to `/login` and never sees the invitation. `/signup` would land in the same trap.

`(dashboard)/layout.tsx` — the gate collapses to two lines: no session →
`/login`; status not `authenticated` → `/onboarding`. The `denied`,
`no-organization` and `no-active-org` branches and the `OrgActivator` render all
go away, because `/onboarding` owns that decision now.

`server-session.ts` — `requireOrgSession`, `requireAuth` and `requireManager`
drop their `/login?denied=1` redirects. Same rule as the layout: no session →
`/login`, a session that will not resolve → `/onboarding`. `requireManager`
keeps `notFound()` for an authenticated non-manager.

`lib/auth/actions.ts` is unchanged.

### Errors

Wrong password, an email that already has an account, an organization name whose
slug collides — each surfaces as an inline banner on the form that caused it, and
the user stays where they are. `createOrganizationAction` keeps its existing
failure toast. A failed `setActive` re-enables the picker with an inline message.
No redirect consumes an error.

## Verification

`pnpm typecheck`, `pnpm lint`, and walking three paths in the browser:

1. Fresh signup → create organization → dashboard.
2. Existing user, one organization → dashboard without touching onboarding.
3. Existing user, two organizations, none active → picker → dashboard.
4. A student session's cookie carried into the admin app → `/onboarding` signs
   it out and lands on `/login` with the form, once, no bouncing.

Plus: an invite link opened with no session reaches `/invite` rather than
`/login`.
