"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Standardized create/edit modal, used by every entity form so the CRUD pattern
 * is identical: header, scrollable body (the form fields), and a footer with
 * Cancel + a pending-aware submit button. Wrap your `<form>` so the footer
 * submit works, by giving the form an `id` and pointing the button at it.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  formId,
  submitLabel = "Save",
  pending = false,
  submitDisabled = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  formId: string;
  submitLabel?: string;
  pending?: boolean;
  submitDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      {/* Capped and row-sized so only the body scrolls — some of these forms
          are long enough to outrun the viewport, and the footer's submit has to
          stay reachable. `pr-1 -mr-1` keeps focus rings off the scrollbar. */}
      <DialogContent
        showCloseButton={!pending}
        className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="-mr-1 min-h-0 overflow-y-auto pr-1">{children}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            disabled={pending || submitDisabled}
          >
            {pending && <Loader2 className="animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
