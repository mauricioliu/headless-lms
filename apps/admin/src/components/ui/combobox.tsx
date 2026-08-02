"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  value: string;
  label: string;
  /** Secondary line — searched alongside the label (e.g. an email). */
  description?: string;
  /** Optional group heading; options keep their given order inside a group. */
  group?: string;
};

/** Lists run to thousands of rows; only this many are put in the DOM at once. */
const MAX_VISIBLE = 100;

function matches(option: ComboboxOption, terms: string[]) {
  const haystack = `${option.label} ${option.description ?? ""}`.toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

/**
 * Searchable single-select for lists too long to scroll — same field API as
 * `Select` (`value` / `onValueChange`), with a filter box and grouped results.
 */
export function Combobox({
  id,
  value,
  onValueChange,
  options,
  placeholder = "Select an option",
  searchPlaceholder = "Search…",
  emptyText = "No matches",
  disabled,
  className,
  "aria-invalid": ariaInvalid,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.value === value);

  const { groups, hidden } = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const found = terms.length === 0 ? options : options.filter((o) => matches(o, terms));
    const visible = found.slice(0, MAX_VISIBLE);

    const byGroup = new Map<string, ComboboxOption[]>();
    for (const option of visible) {
      const key = option.group ?? "";
      const bucket = byGroup.get(key);
      if (bucket) bucket.push(option);
      else byGroup.set(key, [option]);
    }
    return { groups: [...byGroup], hidden: found.length - visible.length };
  }, [options, query]);

  return (
    // `modal` so the listbox stays interactive inside a dialog's focus trap.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-surface px-3 text-sm text-ink outline-none transition-colors",
          "focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25",
          "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
          className,
        )}
      >
        <span className={cn("truncate text-left", !selected && "text-ink-4")}>
          {selected ? (
            <>
              {selected.label}
              {selected.description ? ` · ${selected.description}` : null}
            </>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-3" />
      </PopoverTrigger>

      <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
        <Command shouldFilter={false} defaultValue={value || undefined} loop>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={searchPlaceholder}
            autoFocus
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map(([heading, items]) => (
              <CommandGroup key={heading || "_"} heading={heading || undefined}>
                {items.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                      {option.description ? (
                        <span className="text-ink-3"> · {option.description}</span>
                      ) : null}
                    </span>
                    {option.value === value ? (
                      <Check className="size-4 shrink-0 text-brand" />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          {hidden > 0 ? (
            <p className="border-t border-line px-3 py-2 text-xs text-ink-4">
              {hidden.toLocaleString()} more — keep typing to narrow the list.
            </p>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
