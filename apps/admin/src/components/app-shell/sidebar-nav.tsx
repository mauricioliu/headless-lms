"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavItem } from "./nav";

/** Shared row styling: active = darker text + soft surface, never high-contrast. */
function rowClass(active: boolean) {
  return cn(
    "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none transition-colors",
    "focus-visible:ring-2 focus-visible:ring-ring/40",
    active
      ? "bg-surface font-medium text-ink shadow-sm ring-1 ring-ink/5"
      : "text-ink-2 hover:bg-hover-2 hover:text-ink",
  );
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Vertical nav. Items with children expand into a submenu. */
export function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Primary">
      {items.map((item) =>
        item.children ? (
          <NavSection key={item.label} item={item} pathname={pathname} onNavigate={onNavigate} />
        ) : (
          <Link
            key={item.label}
            href={item.href ?? "/"}
            onClick={onNavigate}
            aria-current={isActive(pathname, item.href ?? "/") ? "page" : undefined}
            className={rowClass(isActive(pathname, item.href ?? "/"))}
          >
            <NavIcon item={item} active={isActive(pathname, item.href ?? "/")} />
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}

function NavIcon({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Icon
      className={cn(
        "size-4 shrink-0 transition-colors",
        active ? "text-brand" : "text-ink-4 group-hover:text-ink-2",
      )}
    />
  );
}

/**
 * Expandable section. Opens automatically when one of its children is the
 * current route; the parent itself carries the active styling only while
 * collapsed, so the highlight never appears twice.
 */
function NavSection({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const children = item.children ?? [];
  const childActive = children.some((child) => isActive(pathname, child.href));
  const [open, setOpen] = React.useState(childActive);
  const [wasChildActive, setWasChildActive] = React.useState(childActive);
  const panelId = `nav-${item.key}`;

  // Re-open when navigation lands on a child from outside the sidebar. Adjusted
  // during render rather than in an effect — no cascading re-render.
  if (wasChildActive !== childActive) {
    setWasChildActive(childActive);
    if (childActive) setOpen(true);
  }

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(rowClass(childActive && !open), "w-full text-left")}
      >
        <NavIcon item={item} active={childActive} />
        {item.label}
        <ChevronRight
          className={cn(
            "ml-auto size-3.5 shrink-0 text-ink-4 transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open ? (
        <div
          id={panelId}
          className="ml-[1.125rem] flex flex-col gap-0.5 border-l border-line pl-2.5"
        >
          {children.map((child) => {
            const active = isActive(pathname, child.href);
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={rowClass(active)}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
