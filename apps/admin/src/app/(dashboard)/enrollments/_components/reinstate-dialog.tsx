"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import type { Enrollment } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Reinstating an *expired* grant needs a fresh expiry, or it lapses again
 * immediately. This dialog offers "no expiry" (default) or a new date.
 */
export function ReinstateDialog({
  enrollment,
  onOpenChange,
  pending,
  onConfirm,
}: {
  enrollment: Enrollment | null;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onConfirm: (expiresAt: string | null) => void;
}) {
  const [mode, setMode] = React.useState<"never" | "date">("never");
  const [date, setDate] = React.useState("");

  // Reset the form when a new target opens (render-time adjust, not an effect).
  const [prevId, setPrevId] = React.useState(enrollment?.id);
  if (enrollment?.id !== prevId) {
    setPrevId(enrollment?.id);
    setMode("never");
    setDate("");
  }

  function confirm() {
    if (mode === "date" && !date) return;
    onConfirm(mode === "never" ? null : new Date(`${date}T23:59:59`).toISOString());
  }

  return (
    <Dialog open={!!enrollment} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-w-md" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Reinstate access</DialogTitle>
          <DialogDescription>
            {enrollment ? (
              <>
                Restore <span className="font-medium text-ink">{enrollment.studentName}</span>’s
                access to {enrollment.courseTitle}. Set a fresh expiry so it isn’t immediately
                lapsed.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-2.5">
          <label className="flex items-center gap-2.5 text-sm text-ink">
            <input
              type="radio"
              name="expiry-mode"
              checked={mode === "never"}
              onChange={() => setMode("never")}
              className="size-4 accent-brand"
            />
            No expiry — access doesn’t lapse
          </label>
          <label className="flex items-center gap-2.5 text-sm text-ink">
            <input
              type="radio"
              name="expiry-mode"
              checked={mode === "date"}
              onChange={() => setMode("date")}
              className="size-4 accent-brand"
            />
            Expires on a date
          </label>
          {mode === "date" && (
            <div className="flex flex-col gap-1.5 pl-6">
              <Label htmlFor="reinstate-date" className="sr-only">
                Expiry date
              </Label>
              <Input
                id="reinstate-date"
                name="expiresAt"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-48"
              />
            </div>
          )}
        </fieldset>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={confirm}
            disabled={pending || (mode === "date" && !date)}
          >
            {pending && <Loader2 className="animate-spin" />}
            Reinstate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
