# apps/student — UI conventions

Read one existing file of the kind you're about to write **before** writing it. The
patterns below are already implemented; copy them, don't re-derive them.

## Forms

Canonical examples: `src/components/welcome/sign-in-form.tsx` and
`src/components/welcome/create-account-form.tsx`.

- `react-hook-form` + `zodResolver`. Module-level `const schema`, `type Values = z.infer<typeof schema>`.
- Fields use the shadcn `Form` primitives from `@/components/ui/form`:
  `<Form {...form}>` wrapping `<form>`, then `FormField` → `FormItem` →
  `FormLabel` / `FormControl` / `FormMessage`. Never a bare `<label>` + `<Input>`
  pair, and never a hand-written error `<p>`.
  (Note: `apps/admin` uses a different, `Field`-based pattern. Don't cross them.)
- `<form className="flex flex-col gap-4">`, `noValidate`.
- Form-level failures render in an `Alert variant="destructive"` at the top of the
  form, held in local state — not a toast.
- Submit button is full width, `variant="brand"`, `disabled={form.formState.isSubmitting}`,
  with a `<Loader2 className="animate-spin" />` while submitting.

## Layout and styling

- **There is no `Card` component in this app and none should be added.** Do not
  wrap forms or content in a rounded bordered box. Screens are laid out directly.
- Shared visual pieces live in `src/components/primitives/` (`status-pill`,
  `progress-bar`, `progress-ring`, `segmented-control`, `course-cover`). Look there
  before building a new one.
- Colours are semantic tokens only: `text-ink` / `ink-2` / `ink-3` / `ink-4` /
  `ink-faint`, `border-line` / `line-strong` / `line-divider`, `bg-page` /
  `bg-surface` / `surface-warm`. Never `text-gray-500`, `bg-white`, or a hex.
- No arbitrary `rounded-[…]` or ad-hoc `border border-gray-*` wrappers.
- Spacing between stacked elements is a `flex flex-col gap-*`, not margins on children.
