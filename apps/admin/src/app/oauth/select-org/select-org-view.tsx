"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/app-shell/logo";
import { authClient } from "@/lib/auth/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Org {
  id: string;
  name: string;
  slug: string;
}

/**
 * Org selection for the MCP OAuth flow. The provider redirects here — between
 * login and consent — when the person belongs to more than one
 * organization, because an access token acts in exactly one and the choice
 * cannot be inferred.
 *
 * The chosen org becomes the session's active org, which the provider then
 * freezes onto the token as its reference id. The signed authorization query is
 * echoed back as `oauth_query` so the flow resumes where it paused.
 */
export function SelectOrgView() {
  const params = useSearchParams();
  const clientId = params.get("client_id") ?? "";
  const [orgs, setOrgs] = React.useState<Org[] | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    authClient.organization
      .list()
      .then((res) => {
        if (cancelled) return;
        setOrgs((res.data as Org[] | undefined) ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your organizations.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function choose(org: Org) {
    setPending(org.id);
    setError(null);
    try {
      const activated = await authClient.organization.setActive({ organizationId: org.id });
      if (activated.error) {
        setError("Could not switch to that organization.");
        setPending(null);
        return;
      }
      const res = await fetch(`${API_URL}/api/auth/oauth2/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ postLogin: true, oauth_query: params.toString() }),
      });
      if (!res.ok) {
        setError(`Request failed (${res.status})`);
        setPending(null);
        return;
      }
      const data = (await res.json()) as { redirect_uri?: string };
      if (data.redirect_uri) {
        window.location.assign(data.redirect_uri);
        return;
      }
      setError("Authorization failed: no redirect received.");
      setPending(null);
    } catch {
      setError("Network error. Please try again.");
      setPending(null);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo org="Headless LMS" />
        </div>
        <div className="mt-6 rounded-card border border-line bg-surface p-6">
          {clientId ? (
            <>
              <h1 className="text-base font-semibold text-ink">Choose an organization</h1>
              <p className="mt-1 text-sm text-ink-2">
                {clientId} will act in the organization you pick, and only that one.
              </p>
              {orgs === null ? (
                <p className="mt-6 flex items-center gap-2 text-sm text-ink-2">
                  <Loader2 className="size-4 animate-spin" />
                  Loading your organizations…
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-2">
                  {orgs.map((org) => (
                    <li key={org.id}>
                      <Button
                        className="w-full justify-start"
                        disabled={pending !== null}
                        onClick={() => choose(org)}
                      >
                        {pending === org.id ? <Loader2 className="animate-spin" /> : null}
                        {org.name}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {error ? (
                <p className="mt-4 flex items-center gap-2 text-sm text-danger">
                  <AlertTriangle className="size-4" />
                  {error}
                </p>
              ) : null}
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-danger">
              <AlertTriangle className="size-4" />
              This authorization link is invalid or has expired.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
