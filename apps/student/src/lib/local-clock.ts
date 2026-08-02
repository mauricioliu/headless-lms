"use client";

// The viewer's clock, as an external store. The server can't know it, so a
// server-rendered fallback covers the first paint; this swaps in the local one
// on hydration and re-renders when the hour turns over (the greeting changes).
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let snapshot: Date | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

const TICK_MS = 60_000;

/** Only an hour or day rollover can change anything we render off the clock. */
function turned(prev: Date, next: Date): boolean {
  return prev.getHours() !== next.getHours() || prev.toDateString() !== next.toDateString();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  timer ??= setInterval(() => {
    const next = new Date();
    if (snapshot && !turned(snapshot, next)) return;
    snapshot = next;
    for (const notify of listeners) notify();
  }, TICK_MS);
  return () => {
    listeners.delete(onChange);
    if (listeners.size > 0 || !timer) return;
    clearInterval(timer);
    timer = null;
  };
}

function getSnapshot(): Date {
  return (snapshot ??= new Date());
}

function getServerSnapshot(): Date | null {
  return null;
}

/** The viewer's current time — `null` on the server and until hydration. */
export function useLocalNow(): Date | null {
  return useSyncExternalStore<Date | null>(subscribe, getSnapshot, getServerSnapshot);
}
