# Course & activity settings

**Status:** approved, ready for planning
**Date:** 2026-07-27

## Summary

Two authoring surfaces in `apps/admin`:

1. A **Settings** tab on a course, backed by a new persisted `settings` blob on `courses`. It holds one control today: allow transcript downloads for every video in the course. The value is stored and read back; nothing consumes it yet.
2. A **Settings** view for an activity, sharing the activity editor's route shell. The editor's action bar is restructured to carry a Content / Settings / Preview segmented switch, so Preview stops being a one-way trip and Settings has somewhere to live.

Activity settings need no backend work — `Activity.settings` is already an opaque blob. Course settings need a full vertical slice: schema → core → api-contract → SDK → admin.

## Decisions

| Decision | Choice |
|---|---|
| Course settings persistence | Real. New `settings jsonb` column, threaded through types, contract, and SDK. |
| Transcript-download behaviour | Persisted, but no consumer. The student app is untouched. |
| Course settings typing | Typed (`CourseSettings`), not opaque — unlike `Activity.settings`. It is a fixed admin surface and the route validates its own response. |
| Patch semantics | Shallow jsonb merge in the repository, so a partial patch cannot clobber sibling keys. |
| Activity settings storage | The existing opaque `Activity.settings` blob. No schema, contract, or SDK change. |
| Editor bar | Restructured into three zones with a Content / Settings / Preview segmented switch. |
| Save affordance | One Save in the bar, driven by whichever page is active. |
| Existing item-form sheet | Stays. It creates activities and quick-renames from the curriculum list; the Settings view is the fuller surface. Both write the same blob. |

## Course settings — backend

### Schema

`packages/server/src/adapters/db/schema/content.ts`, `courses`:

```ts
settings: jsonb('settings').notNull().default({}),
```

Generate the migration with `pnpm db:generate`.

### Types

`packages/types/src/content.ts` — declared once, re-exported by `core/content/model.ts` / `types.ts` per the type-ownership rule:

```ts
export interface CourseSettings {
  /** Students may download a text transcript for every video in the course. */
  transcriptDownloads: boolean;
}
```

- `Course` gains `settings: CourseSettings`.
- `UpdateCourseInput` gains `settings?: Partial<CourseSettings> | undefined`.

### Repository

`packages/server/src/adapters/db/repositories/content.ts`:

- `CourseRow` selects `settings`; `toCourse` applies defaults over the stored blob:
  ```ts
  settings: { transcriptDownloads: false, ...(row.settings as Partial<CourseSettings>) },
  ```
  A row written before the column existed, or one holding a subset of keys, still produces a complete `CourseSettings`.
- `update` merges instead of replacing:
  ```ts
  if (patch.settings !== undefined) {
    set.settings = sql`${courses.settings} || ${JSON.stringify(patch.settings)}::jsonb`;
  }
  ```

`ContentService.update` needs no change — it already forwards the whole patch and emits `course.updated`.

### Contract and SDK

`packages/api-contract/src/content.ts`:

```ts
export const CourseSettings = z.object({ transcriptDownloads: z.boolean() });
export const Course = z.object({ /* … */ settings: CourseSettings });
export const UpdateCourse = CreateCourse.partial().extend({
  status: CourseStatus.optional(),
  settings: CourseSettings.partial().optional(),
});
```

The existing `PATCH /courses/:id` carries it — no new route, no new tag. Run `pnpm gen:sdk` (database must be up) and commit the regenerated `openapi.json` and `packages/sdk/src/generated`.

### Test

`packages/server/src/core/content/service.test.ts`: updating one settings key leaves the others intact, and a course created without settings reads back the defaults.

## Course settings — admin

### Navigation

`courses/[courseId]/_components/course-tabs-nav.tsx` gains a fifth tab, `settings`, after Access. Details keeps `Settings2`; the new tab uses a distinct icon (`SlidersHorizontal`) so the two are not confusable.

### Route

`courses/[courseId]/settings/page.tsx` — RSC, reads the course via `serverApi.getCourse(courseId)` (the layout already gates on `isManager`), renders `_components/course-settings-form.tsx`.

### Form

Client component, following `settings/general/general-view.tsx`: react-hook-form + zod resolver, `rounded-card border border-line bg-surface` card, Save in a bordered footer, disabled until dirty, `toast` on success or failure, `router.refresh()` after save.

One section, **Video**, one row:

- Label: *Allow transcript downloads*
- Hint: *Students can download a text transcript for every video in this course.*
- Control: `Switch`, right-aligned in a `border-line bg-surface-2` row, matching the visibility row already used in `item-form-sheet.tsx`.

The section renders as a labelled group (heading + one-line description above the row) so a second group can be added without re-laying-out the page.

### Action

`courses/[courseId]/actions.ts`:

```ts
export async function updateCourseSettingsAction(
  courseId: string,
  settings: Partial<CourseSettings>,
): Promise<Course>
```

Calls `api.updateCourse(courseId, { settings })` and revalidates the course path, mirroring `updateCourseDetailsAction`. `CourseSettings` reaches the admin app through `apps/admin/src/lib/api/types.ts`, which re-exports it off the generated SDK alongside `Course`.

## Activity editor shell

### Routes

`courses/[courseId]/content/[activityId]/` becomes a shell with three siblings:

```
[activityId]/
  layout.tsx        ← loads the activity, renders the bar + children
  editor/page.tsx   ← Content   (existing, minus its own header)
  settings/page.tsx ← Settings  (new)
  preview/page.tsx  ← Preview   (existing, minus its own header and back link)
```

`layout.tsx` loads modules via `serverApi.listModules(courseId)`, finds the activity, `notFound()`s if absent, and renders the bar with its title. The pages keep their own loads; Next dedupes the fetch within a request.

### The bar

Client component `_components/activity-bar.tsx`, three zones:

- **Left** — back link to the curriculum, then the truncated activity title.
- **Centre** — a segmented control of three `Link`s (Content / Settings / Preview) styled as one shadcn-flavoured segment group; active state derived from `usePathname()`, like `course-tabs-nav.tsx`.
- **Right** — an unsaved-changes hint and the Save button.

### One Save, three pages

`ActivityBarProvider` lives in the layout and holds the current save registration:

```ts
interface SaveRegistration {
  save: () => Promise<void>;
  saving: boolean;
  dirty: boolean;
}
registerSave(registration: SaveRegistration | null): void
```

- The Content page registers the editor's `saveNow` / `saving` from `ActivityEditorProvider` (which stays inside `editor/`, wrapping only that page).
- The Settings page registers its form submit and RHF's `isSubmitting` / `isDirty`.
- Preview registers nothing, so the bar hides Save.

Registration happens in an effect keyed on the handler identity, and clears on unmount so a stale page's Save never survives a segment change.

### Activity settings view

`settings/page.tsx` is an RSC that reads the activity's blob and hands it to a client form, laid out like the course settings form. Fields, all persisted into the opaque blob:

| Field | Control | State |
|---|---|---|
| Title | `Input` | Real — same `settings.title` the item sheet writes |
| Published | `Switch` | Real — same `settings.published` |
| Completion rule | `Select`: On view / On video watched / Manual | Placeholder — stored, no consumer |
| Transcript downloads | `Select`: Inherit from course / Always / Never | Placeholder — stored, no consumer |

The transcript row's hint states what *Inherit* currently resolves to, reading the course's `settings.transcriptDownloads`.

`ActivitySettings` in `apps/admin/src/lib/api/types.ts` widens to:

```ts
completion?: "view" | "video" | "manual";
transcriptDownloads?: "inherit" | "always" | "never";
```

Saving spreads the existing blob and overwrites the edited keys, exactly as `item-form-sheet.tsx` does, so `content` and any unknown keys survive. It calls the existing `saveActivityAction` — no new action, no backend change.

### Curriculum entry point

`_components/item-row.tsx` gains a **Settings** dropdown item linking to `.../[activityId]/settings`, beside the existing Edit and Edit content items.

## Error handling

Nothing new. Both forms surface failures through the existing `toast.error(..., { description })` path; the server actions propagate SDK errors unchanged; the layout `notFound()`s on a missing activity as the editor page does today.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm test` across workspaces.
- `pnpm db:generate` produces exactly one migration, and `pnpm db:migrate` applies it.
- `pnpm gen:sdk` leaves no uncommitted diff after the contract change is committed.
- Manual: toggle the course setting, reload, and confirm it reads back; switch between Content, Settings, and Preview and confirm Save applies to the page in view.
