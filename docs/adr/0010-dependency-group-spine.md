# Dependency Group spine drawn from measured icon positions

The compact course view marks **Dependency Groups** — contiguous runs of dependency-linked lessons within a section — with dashed vertical lines connecting adjacent lesson-type icons, plus extra vertical spacing separating each group from its neighbours. The lines are drawn by a `MeasuredSpine` overlay (`dep-group-spine.tsx`) that **measures the rendered icon positions** (`getBoundingClientRect`) and draws each segment between two real icon centres, re-measuring via a `ResizeObserver` on any reflow. Grouping is computed per-section in `section-grid.tsx` (`computeDependencyGroupConnections` / `groupIntoRuns`).

## Scope

- **Compact view only.** Expanded view passes no group connections, so every run is a lone lesson and nothing is drawn.
- **Suppressed under any active filter/search.** A filtered list no longer reflects true adjacency, so drawing adjacency lines would lie. Grouping is computed only when `!hasActiveFilters`.
- **Renders in read-only / published versions.** The treatment is a derived reading aid, never stored; it shows wherever the compact view shows.
- **Ghost Lessons participate** as ordinary members of the walk.
- The grouping rule itself (within-section, contiguous-only, directed-backward, direct-deps-only) is specified under **Dependency Group** in `CONTEXT.md`.

## Why this shape

- **Fixed-pixel line heights cannot survive title wrapping** — the deciding constraint. The icon sits in a flex row whose height changes when a lesson title wraps to two lines, so any hard-coded segment height drifts off the icon centres. Several fixed-height attempts (18px, 24px) all broke the moment a row grew. Measuring the actual icon rects is the only approach that stays anchored.
- **`ResizeObserver` over a one-shot measure** — rows reflow after the initial paint (font load, title edit, window resize, drag-reorder settle), so the overlay must re-measure, not measure once.
- **Overlay keyed off a `[data-dep-icon]` attribute** rather than threading refs through `SortableLessonItem` — the spine lives entirely in the list container and finds icons by selector, so the lesson item stays unaware of grouping (it only tags its icon).
- **Spacing tuned to 20px (`mt-5/mb-5`), edges zeroed, lone lessons untouched** — the inter-group gap must stay comfortably larger than the ~14px intra-group row spacing or the blocks stop reading as distinct. Adjacent group margins collapse so two touching groups share one gap; `first:/last:` zero the list's outer edges.

## Known limitations

- During an active drag the overlay does not track the moving icon; segments settle on drop.
- The overlay is the container's last DOM child, so the final run is not technically `:last-child` — a benign edge case for `last:mb-0`.
