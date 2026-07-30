"use client";

import * as React from "react";
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
 * Modal counterpart to {@link FormSheet}, with the same contract: header, the
 * form fields, and a footer with Cancel + a pending-aware submit button. Give
 * your `<form>` an `id` and pass it as `formId` so the footer submit works.
 *
 * Reach for this over `FormSheet` when the form is a couple of fields deep and
 * the surface behind it doesn't need to stay visible.
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
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
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
