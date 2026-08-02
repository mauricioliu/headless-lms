import type { VariantProps } from "class-variance-authority";

import type { buttonVariants } from "@/components/ui/button";
import type { CourseState } from "@/lib/dashboard";

export interface CourseAction {
  label: string;
  variant: NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
  icon: boolean;
}

/** The card/row call-to-action for a course in a given state. */
export function courseAction(state: CourseState): CourseAction {
  switch (state) {
    case "not-started":
      return { label: "Start", variant: "brand", icon: true };
    case "completed":
      return { label: "Review", variant: "ghostOutline", icon: false };
    case "expired":
      return { label: "Renew", variant: "ghostOutline", icon: false };
    default:
      return { label: "Continue", variant: "brand", icon: true };
  }
}
