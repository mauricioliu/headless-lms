import Link from "next/link";
import type { ReactNode } from "react";
import { MessagesSquare } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listHref, type RawSearchParams } from "../_lib/list-url";

export function CommentPager({
  path,
  search,
  page,
  lastPage,
  total,
}: {
  path: string;
  search: RawSearchParams;
  page: number;
  lastPage: number;
  total: number;
}) {
  return (
    <div className="flex items-center justify-between text-xs text-ink-3">
      <span>
        Page {page} of {lastPage} · {total} comments
      </span>
      <div className="flex gap-2">
        <PageLink path={path} search={search} to={page - 1} disabled={page <= 1}>
          Previous
        </PageLink>
        <PageLink path={path} search={search} to={page + 1} disabled={page >= lastPage}>
          Next
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  path,
  search,
  to,
  disabled,
  children,
}: {
  path: string;
  search: RawSearchParams;
  to: number;
  disabled: boolean;
  children: ReactNode;
}) {
  const className = cn(buttonVariants({ size: "sm", variant: "ghost" }));
  if (disabled) {
    return (
      <span aria-disabled className={cn(className, "pointer-events-none opacity-50")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={listHref(path, search, { page: to > 1 ? String(to) : null })} className={className}>
      {children}
    </Link>
  );
}

export function CommentEmpty() {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line py-16 text-center">
      <MessagesSquare className="size-8 text-ink-faint" />
      <p className="mt-3 text-sm font-medium text-ink">No comments here</p>
      <p className="mt-1 text-sm text-ink-3">Try a different filter or clear your search.</p>
    </div>
  );
}
