import { redirect } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { listHref, type RawSearchParams } from "../_lib/list-url";

/** Search box. A Server Action + redirect rather than a router push, so it
 *  submits and navigates with or without JS. */
export function CommentSearch({
  path,
  search,
  value,
}: {
  path: string;
  search: RawSearchParams;
  value: string;
}) {
  async function submit(formData: FormData) {
    "use server";
    const q = String(formData.get("q") ?? "").trim();
    redirect(listHref(path, search, { q: q || null }));
  }

  return (
    <form action={submit} className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-4" />
      <Input
        name="q"
        type="search"
        defaultValue={value}
        placeholder="Search comments"
        className="w-56 pl-8"
      />
    </form>
  );
}
