"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Check, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { bulkApproveCommentsAction, bulkRemoveCommentsAction } from "../actions";

interface SelectionState {
  selected: Set<string>;
  toggle: (id: string, next: boolean) => void;
}

const SelectionContext = createContext<SelectionState | null>(null);

/** Which rows are ticked. Ephemeral cross-row state — the one thing on this
 *  page that genuinely cannot live in the URL or on the server. */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string, next: boolean) => {
    setSelected((prev) => {
      const s = new Set(prev);
      if (next) s.add(id);
      else s.delete(id);
      return s;
    });
  }, []);

  const value = useMemo(() => ({ selected, toggle }), [selected, toggle]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

function useSelection(): SelectionState {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useSelection must be used within SelectionProvider");
  return ctx;
}

export function useIsSelected(id: string): [boolean, (next: boolean) => void] {
  const { selected, toggle } = useSelection();
  return [selected.has(id), (next) => toggle(id, next)];
}

/**
 * Select-all + the bulk action bar. `ids` are only the rows carrying a checkbox —
 * a nested reply is moderated through its parent's card, so select-all must not
 * silently include it.
 */
export function SelectionBar({ ids }: { ids: string[] }) {
  const { selected, toggle } = useSelection();
  const [isPending, startTransition] = useTransition();

  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  const count = ids.filter((id) => selected.has(id)).length;

  const clear = () => ids.forEach((id) => toggle(id, false));

  function bulk(label: string, action: (ids: string[]) => Promise<void>) {
    const chosen = ids.filter((id) => selected.has(id));
    startTransition(async () => {
      try {
        await action(chosen);
        clear();
        toast.success(label);
      } catch (err) {
        toast.error("Could not complete", { description: (err as Error).message });
      }
    });
  }

  return (
    <div className="flex min-h-8 items-center justify-between">
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-3">
        <Checkbox
          checked={allSelected}
          onChange={() => ids.forEach((id) => toggle(id, !allSelected))}
        />
        Select all
      </label>

      {count > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-3">{count} selected</span>
          <Button
            size="sm"
            variant="primary"
            disabled={isPending}
            onClick={() => bulk("Approved", bulkApproveCommentsAction)}
          >
            <Check />
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => bulk("Removed", bulkRemoveCommentsAction)}
          >
            <Trash2 />
            Remove
          </Button>
          <Button size="sm" variant="ghost" onClick={clear}>
            <X />
            <span className="sr-only">Clear selection</span>
          </Button>
        </div>
      )}
    </div>
  );
}
