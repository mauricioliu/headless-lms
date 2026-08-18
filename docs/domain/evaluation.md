# Evaluation — Domain Spec

Owns the multiple-choice **evaluation** a course carries: the question document, its correction key, and the rules that govern both. One course has at most one evaluation, and the evaluation has no life apart from its course — it is authored as a complete document, travels with the course's publication, and dies with the course.

## Scope

- Owns the evaluation document for a course: its schema, invariants, and complete-replacement semantics.
- Owns the **correction key** (`correctOptionId` per question). It enters once, at authoring time, and never leaves the domain: every view, event, and learner-facing read is stripped of it.
- Owns the delivery settings — the passing `cutoff` (1–100, default 70) and the `feedbackMode` (`score_only` | `answer_review`, default `score_only`) that decide what a learner sees after attempting.
- Does **not** own the course (content), access to it (entitlements), or any per-learner state (progress). Attempt-taking and scoring are not built; when they are, they will live behind this domain's document, not inside it.

## Capabilities

- **Author** — create or completely replace a course's evaluation in one shot. There are no partial updates: a replacement carries the whole document (1–100 questions, 2–6 options each, unique question and option ids, a correct option that belongs to its question) or it is rejected with schema errors and changes nothing.
- **Present** — serve the sanitized evaluation (no correction key) to staff authors and, through the read layer, to entitled learners once the course is published.

## Model

### Entities

- **Evaluation** — one row per `(org, course)`: the questions document, cutoff, and feedback mode. Keyed by course with a cascading foreign key, so a deleted course takes its evaluation with it; no publication state of its own.
- **Question** — `id`, prompt, 2–6 options, and the correction key naming one option.
- **Option** — `id` and text.

### Invariants

- The document is replaced whole or not at all — an invalid replacement leaves the stored evaluation untouched.
- Question ids and option ids are unique within the document, and each `correctOptionId` names one of its own question's options.
- The correction key never appears in any view, response, or event payload.

## Boundaries

1. **evaluation → content** — the evaluation exists only for an existing course of the same org: authoring checks the course, and the storage-level course link cascades deletion. Content knows nothing of evaluations.
2. **evaluation → read layer** — the learner-facing surface (learn/reporting) reads the sanitized evaluation and gates it behind the course's published status plus the learner's entitlement; evaluation itself holds no access rules.
3. **evaluation ↔ automations** — the domain emits `evaluation.replaced`; automations may trigger off it but receives no correction key.

## Events

- `evaluation.replaced` — emitted on every successful authoring replacement, carrying the sanitized view.

## Build state

Built and **persisted** (authoring HTTP seam, storage, outbox event). Learner attempt-taking and scoring are future work.
