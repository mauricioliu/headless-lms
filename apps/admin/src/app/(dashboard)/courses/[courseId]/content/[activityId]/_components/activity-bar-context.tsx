"use client";

import * as React from "react";

/** What the bar needs to drive Save for whichever view is on screen. */
export interface SaveState {
  save: () => void | Promise<void>;
  saving: boolean;
  dirty: boolean;
}

/** Identity token so a page's unmount can't clear a newer page's registration. */
type Owner = object;

interface ActivityBarValue {
  save: SaveState | null;
  register: (owner: Owner, state: SaveState | null) => void;
}

const ActivityBarContext = React.createContext<ActivityBarValue | null>(null);

/**
 * Holds the bar's Save wiring for the activity's three views. The bar lives in
 * the layout, above Content / Settings / Preview, so the view on screen tells it
 * what Save means — the editor's config save, the settings form's submit, or
 * nothing at all (Preview), which hides the button.
 */
export function ActivityBarProvider({ children }: { children: React.ReactNode }) {
  const [save, setSave] = React.useState<SaveState | null>(null);
  const ownerRef = React.useRef<Owner | null>(null);

  const register = React.useCallback((owner: Owner, state: SaveState | null) => {
    if (state === null) {
      // Ignore a stale unmount: the next view has already taken the slot.
      if (ownerRef.current !== owner) return;
      ownerRef.current = null;
      setSave(null);
      return;
    }
    ownerRef.current = owner;
    setSave(state);
  }, []);

  const value = React.useMemo(() => ({ save, register }), [save, register]);
  return <ActivityBarContext.Provider value={value}>{children}</ActivityBarContext.Provider>;
}

export function useActivityBar(): ActivityBarValue {
  const ctx = React.useContext(ActivityBarContext);
  if (!ctx) throw new Error("useActivityBar must be used inside <ActivityBarProvider>");
  return ctx;
}

/** Claim the bar's Save button for the mounted view. */
export function useRegisterSave({ save, saving, dirty }: SaveState): void {
  const { register } = useActivityBar();
  const [owner] = React.useState<Owner>(() => ({}));

  React.useEffect(() => {
    register(owner, { save, saving, dirty });
    return () => register(owner, null);
  }, [register, owner, save, saving, dirty]);
}
