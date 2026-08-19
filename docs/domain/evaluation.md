# Evaluation — Domain Spec

Owns the multiple-choice **evaluation** a course carries: the question document, its correction key, and the rules that govern both. One course has at most one evaluation, and the evaluation has no life apart from its course — it is authored as a complete document, travels with the course's publication, and dies with the course.

## Scope

- Owns the evaluation document for a course: its schema, invariants, and complete-replacement semantics.
- Owns the **correction key** (`correctOptionId` per question). It enters once, at authoring time, and never leaves the domain: every view, event, and learner-facing read is stripped of it.
- Owns the delivery settings — the passing `cutoff` (1–100, default 70) and the `feedbackMode` (`score_only` | `answer_review`, default `score_only`) that decide what a learner sees after attempting.
- Owns **attempt-taking and scoring**: the append-only Intento ledger per (course, learner). Starting an attempt is gated on 100% course progress (read from progress); grading happens inside this domain against the key; feedback is shaped per `feedbackMode`.
- Does **not** own the course (content), access to it (entitlements), or any per-learner progress state (progress owns Completado — see boundaries).

## Capabilities

- **Author** — create or completely replace a course's evaluation in one shot. There are no partial updates: a replacement carries the whole document (1–100 questions, 2–6 options each, unique question and option ids, a correct option that belongs to its question) or it is rejected with schema errors and changes nothing.
- **Present** — serve the sanitized evaluation (no correction key) to staff authors and, through the read layer, to entitled learners once the course is published.
- **Attempt** — start (or resume the one open) Intento for an entitled learner whose course progress reads 100%. Unlimited attempts; at most one open at a time; the server refuses to start or submit below 100%.
- **Grade** — score a submission inside this domain against the correction key: every question answered exactly once, each option belonging to its question, score = round(hits ÷ questions × 100), passed = score ≥ the cutoff in force at grading time. The attempt row freezes answers, score, cutoff, and timestamps — append-only, never edited.
- **Feed back** — return the last attempt shaped per `feedbackMode`: `score_only` carries the score alone; `answer_review` adds per-question hit/miss, the learner's selection, and every option — never which remaining option was correct on a miss.

## Model

### Entities

- **Evaluation** — one row per `(org, course)`: the questions document, cutoff, and feedback mode. Keyed by course with a cascading foreign key, so a deleted course takes its evaluation with it; no publication state of its own.
- **Question** — `id`, prompt, 2–6 options, and the correction key naming one option.
- **Option** — `id` and text.
- **Attempt (Intento)** — one row per `(org, course, orgUser, attemptNumber)`: `startedAt` (inicio), `submittedAt` (envío), the recorded `answers`, the `score`, the `cutoff` in force at grading, and `passed`. Append-only: inserted at start, completed once by submission, never updated or deleted afterwards. Attempts number sequentially per learner; the last one is the one that stands.

### Invariants

- The document is replaced whole or not at all — an invalid replacement leaves the stored evaluation untouched.
- Question ids and option ids are unique within the document, and each `correctOptionId` names one of its own question's options.
- The correction key never appears in any view, response, or event payload.
- An attempt only moves forward while the learner's course progress reads 100% — the gate is evaluated by the server, at start and at submit.
- A submission answers every question of the current document exactly once; anything else is rejected and leaves the attempt open.
- A graded attempt is immutable: resubmission is a conflict, and the next attempt is a new row.
- `answer_review` feedback never identifies the correct option on a question the learner missed; on a hit, the learner's own selection is the confirmation.

## Boundaries

1. **evaluation → content** — the evaluation exists only for an existing course of the same org: authoring checks the course, and the storage-level course link cascades deletion. Content knows nothing of evaluations.
2. **evaluation → read layer** — the learner-facing surface (learn/reporting) reads the sanitized evaluation and gates it behind the course's published status plus the learner's entitlement; evaluation itself holds no access rules.
3. **evaluation → progress** — starting/submitting an attempt reads the course percentage from progress (the rendir gate), and a passed attempt asks progress to re-evaluate course completion (the Completado conjunction is progress's fact, not this domain's). Progress reads approval back through this domain's latest attempt.
4. **evaluation ↔ automations** — the domain emits `evaluation.replaced` and `evaluation.attempt.graded`; automations may trigger off them but receives no correction key.

## Events

- `evaluation.replaced` — emitted on every successful authoring replacement, carrying the sanitized view.
- `evaluation.attempt.graded` — emitted when an attempt is scored, carrying the attempt number, answers, score, cutoff in force, and pass flag (no correction key).

## Build state

Built and **persisted** (authoring HTTP seam, storage, outbox event, attempt-taking/grading HTTP seam, append-only attempt storage).
