"use client";

import type { ComponentProps } from "react";
import { DropdownMenu as DM } from "radix-ui";

import { cn } from "@/lib/utils";

const DropdownMenu = (p: ComponentProps<typeof DM.Root>) => (
  <DM.Root data-slot="dropdown-menu" {...p} />
);

const DropdownMenuTrigger = (p: ComponentProps<typeof DM.Trigger>) => (
  <DM.Trigger data-slot="dropdown-menu-trigger" {...p} />
);

function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "end",
  ...props
}: ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        data-slot="dropdown-menu-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-40 overflow-hidden rounded-lg border border-line bg-surface p-1 text-ink shadow-[0_16px_40px_-16px_rgba(0,0,0,0.25)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}

function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: ComponentProps<typeof DM.Item> & { variant?: "default" | "danger" }) {
  return (
    <DM.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none select-none",
        "transition-colors focus:bg-hover-surface focus:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-3",
        variant === "danger" && "text-destructive focus:text-destructive [&_svg]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />;
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
};
