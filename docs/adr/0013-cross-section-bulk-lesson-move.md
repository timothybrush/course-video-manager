---
status: accepted
---

# Cross-section bulk lesson move folds the single-lesson planner

ADR 0012 shipped bulk lesson reorder as within-section-only and deferred cross-section bulk moves. This ADR lifts that restriction: a multi-lesson selection dragged into a different section now moves the whole selection, landing as one contiguous block at the drop anchor in the target.

When the user drags a selected lesson's grip into another section, `buildLessonDropEvent` emits a `move-lessons-to-section` event carrying the selected `lessonIds` in source display order, the `targetSectionId`, and the drop `beforeLessonId`. The server (`moveLessonsToSection`) and the client optimistic applier (`applyMoveLessonsToSection`) both run the shared multi-lesson planner `planLessonsMove`.

## Why this shape

- **Fold the proven planner instead of writing a second one.** `planLessonsMove` does not re-derive the move cascade. It folds `planLessonMove` (ADR 0011) over the selected lessons one at a time, threading the post-move model into the next step. Every single move reuses the exact placement, source/target renumbering, and section materialize/dematerialize logic that already has test coverage and a server/client parity guarantee. The multi-lesson planner adds only the fold and a pure "apply this step's deltas to the model" helper.
- **Anchoring every lesson at the same `beforeLessonId`, in source order, yields a contiguous in-order block.** Each lesson is inserted immediately before the anchor; the previously-moved lesson becomes a predecessor of the anchor, so the next lesson lands just after it and just before the anchor. Iterating in source display order therefore preserves relative order and leaves no gaps. The anchor is a target-section lesson, so it is never itself one of the moved IDs — this is simpler than the within-section case, which had to handle a selected anchor.
- **fsOps concatenate into one sequentially-valid script.** Because each step is planned against the model the previous step produced, executing the concatenated `fsOps` reproduces exactly what a sequence of single moves would do on disk. The cost is that renumbering ops can repeat across steps; this is acceptable and correct, and keeps the planner trivial.
- **One applier path for single and bulk moves.** `applyMoveLessonToSection` and `applyMoveLessonsToSection` both delegate to a shared `applyMovePlanToLoader`, which drops the moved set from their sources and re-inserts the block at the anchor. The single-lesson case is the one-element block, so there is no behavioural divergence between the two events in the optimistic layer.

## Consequences

- `move-lessons-to-section` is a distinct event from `move-lesson-to-section`. The single-lesson event and its drag path are unchanged; the bulk event is only emitted when a multi-lesson selection is dragged across sections.
- The selection model still enforces single-section selection (ADR 0012), so the planner can assume every moved lesson originates in one source section.
- Mixed real/ghost selections work without special handling — each lesson's step uses the single planner's existing real-vs-ghost branch.
