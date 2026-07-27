"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/app-shell/logo";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Landing page for the MCP OAuth consent redirect. The provider redirects here
 * with the signed authorization query (`client_id`, `scope`, `sig`, …), which is
 * echoed back verbatim as `oauth_query` when answering the prompt via
 * `POST /api/auth/oauth2/consent`. The response carries the redirect back to the
 * client.
 *
 * The organization this authorization binds to is the session's active org — a
 * person in several orgs picks one at `/oauth/select-org` before landing here.
 */
export function ConsentView() {
  const params = useSearchParams();
  const clientId = params.get("client_id") ?? "";
  const scopes = (params.get("scope") ?? "").split(" ").filter(Boolean);
  const [pending, setPending] = React.useState<"allow" | "deny" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function respond(accept: boolean) {
    setPending(accept ? "allow" : "deny");
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/oauth2/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accept, oauth_query: params.toString() }),
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
              <h1 className="text-base font-semibold text-ink">{clientId} wants access</h1>
              <p className="mt-1 text-sm text-ink-2">
                This app is requesting the following permissions:
              </p>
              <ul className="mt-3 list-disc pl-5 text-sm text-ink-2">
                {scopes.map((scope) => (
                  <li key={scope}>{scope}</li>
                ))}
              </ul>
              <div className="mt-6 flex gap-3">
                <Button
                  variant="primary"
                  className="flex-1"
                  disabled={pending !== null}
                  onClick={() => respond(true)}
                >
                  {pending === "allow" ? <Loader2 className="animate-spin" /> : null}
                  Allow
                </Button>
                <Button
                  className="flex-1"
                  disabled={pending !== null}
                  onClick={() => respond(false)}
                >
                  {pending === "deny" ? <Loader2 className="animate-spin" /> : null}
                  Deny
                </Button>
              </div>
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
