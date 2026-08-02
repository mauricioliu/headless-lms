"use client";

// App-wide client state: a toast and the accent knob. Nothing server-sourced
// lives here — data that comes from a route's server render is owned by that
// route's tree, initialised directly from props.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type Accent = "indigo" | "emerald" | "orange" | "ink";

interface ToastState {
  id: number;
  message: string;
}

interface AppState {
  toast: ToastState | null;
  showToast: (message: string) => void;
  accent: Accent;
  setAccent: (a: Accent) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [accent, setAccent] = useState<Accent>("indigo");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast({ id: Date.now(), message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const value: AppState = { toast, showToast, accent, setAccent };

  return (
    <AppContext.Provider value={value}>
      <div data-accent={accent === "indigo" ? undefined : accent}>{children}</div>
    </AppContext.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
