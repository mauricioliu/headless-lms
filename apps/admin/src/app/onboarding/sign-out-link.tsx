"use client";

import { signOut } from "@/lib/auth/client";

export function SignOutLink() {
  return (
    <button
      type="button"
      onClick={() => void signOut().finally(() => window.location.assign("/login"))}
      className="mx-auto mt-4 block text-sm text-ink-3 underline-offset-4 hover:text-ink hover:underline"
    >
      Cerrar sesión
    </button>
  );
}
