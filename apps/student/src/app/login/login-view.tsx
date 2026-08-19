"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import { signIn, useSession } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LoginView({ brandName }: { brandName: string }) {
  const router = useRouter();
  const params = useSearchParams();
  // Where the proxy wanted the user to land before it bounced them here.
  // Only accept in-app absolute paths to avoid an open-redirect.
  const nextParam = params.get("next");
  const next =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const { data: session } = useSession();

  // A session that reaches this page is one worth honouring. Anything the API
  // rejected was revoked at `/session/reset` before the browser got here, so
  // there is no stale-but-truthy case to second-guess.
  useEffect(() => {
    if (session) router.replace(next);
  }, [session, router, next]);

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Form column */}
      <div className="flex flex-col bg-surface">
        <div className="flex h-16 items-center px-6 sm:px-10">
          <span className="text-lg font-semibold tracking-tight text-ink">{brandName}</span>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-xs">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-ink text-balance">
                Iniciar sesión
              </h1>
              <p className="text-sm text-ink-3 text-pretty">
                Bienvenido de nuevo. Ingresa tus datos para continuar tus cursos.
              </p>
            </div>
            <SignInForm onDone={() => router.replace(next)} />
          </div>
        </div>
      </div>

      {/* Showcase column — calm dark panel */}
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <blockquote className="max-w-md">
            <p className="text-2xl font-medium tracking-tight text-surface text-balance">
              Tus cursos, en un solo lugar tranquilo. Retoma justo donde lo dejaste.
            </p>
            <footer className="mt-4 text-sm text-surface/60">
              Plataforma de cursos por Nuvora
            </footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}

function SignInForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signIn.email({ email, password });
    if (error) {
      setError(
        error.status === 401
          ? "Correo o contraseña incorrectos."
          : "No pudimos iniciar sesión. Inténtalo de nuevo.",
      );
      setSubmitting(false);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-quiz-wrong-border bg-quiz-wrong-bg px-3 py-2.5 text-sm text-quiz-wrong-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-ink">
          Correo
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="tu@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      <Button type="submit" variant="brand" disabled={submitting} className="mt-1 w-full">
        {submitting && <Loader2 className="animate-spin" />}
        Iniciar sesión
      </Button>
    </form>
  );
}

const inputClass = cn(
  "h-9 w-full rounded-md border border-line-btn bg-surface px-3 text-sm text-ink",
  "placeholder:text-ink-faint transition-colors outline-none",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30",
);
