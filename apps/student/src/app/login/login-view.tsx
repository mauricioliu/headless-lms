"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Loader2, MailCheck } from "lucide-react";

import { authClient, signIn, useSession } from "@/lib/auth/client";
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
            <LoginForms onDone={() => router.replace(next)} />
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

function LoginForms({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  return mode === "forgot" ? (
    <ForgotPasswordForm onBack={() => setMode("signin")} />
  ) : (
    <SignInForm onDone={onDone} onForgotPassword={() => setMode("forgot")} />
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: failure } = await authClient.requestPasswordReset({ email });
    // Any answered request — success or API error — confirms the same way, so
    // a known and an unknown address are indistinguishable.
    if (failure && failure.status == null) {
      setError("No pudimos enviar el correo. Inténtalo de nuevo.");
      setSubmitting(false);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 py-4 text-center">
        <div className="grid size-10 place-items-center rounded-full bg-surface-2 text-brand">
          <MailCheck className="size-5" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-ink">Revisa tu correo</h2>
        <p className="text-sm text-ink-3 text-pretty">
          Si el correo está registrado, llegó un enlace para restablecer tu contraseña. El enlace
          expira pronto.
        </p>
        <Button variant="ghost" size="sm" onClick={onBack} className="mt-2">
          <ArrowLeft />
          Volver a iniciar sesión
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-tight text-ink text-balance">
          Restablecer contraseña
        </h2>
        <p className="text-sm text-ink-3 text-pretty">
          Te enviaremos un enlace para elegir una contraseña nueva.
        </p>
      </div>
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-quiz-wrong-border bg-quiz-wrong-bg px-3 py-2.5 text-sm text-quiz-wrong-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="forgot-email" className="text-sm font-medium text-ink">
          Correo
        </label>
        <input
          id="forgot-email"
          type="email"
          autoComplete="email"
          placeholder="tu@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          required
        />
      </div>
      <Button type="submit" variant="brand" disabled={submitting} className="mt-1 w-full">
        {submitting && <Loader2 className="animate-spin" />}
        Enviar enlace
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft />
        Volver a iniciar sesión
      </Button>
    </form>
  );
}

function SignInForm({
  onDone,
  onForgotPassword,
}: {
  onDone: () => void;
  onForgotPassword: () => void;
}) {
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
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium text-ink">
            Contraseña
          </label>
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-sm text-ink-3 underline-offset-4 hover:text-ink hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>
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
