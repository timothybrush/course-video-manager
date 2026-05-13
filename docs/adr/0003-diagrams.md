# Diagrams as first-class entities with per-Clip snapshots

We needed to stop losing the state of TLDraw diagrams between **Clips** — the existing pattern (one giant shared canvas) means later edits silently mutate the diagram a past Clip was filmed against. Decision: introduce **Diagram** as a named, persistent lineage and **DiagramSnapshot** as an immutable per-Clip frozen TLDraw scene. A Clip carries a nullable `diagramSnapshotId` pin; the Diagram itself owns a mutable `headScene` that is the live editing surface. Snapshots are forked from `headScene` at Clip persist time via the Snapshot Rule (below), content-hash-deduped per Diagram. Rejected the alternative of a single mutable scene shared across clips (the status quo, sharded) because it doesn't solve the state-loss problem — it just reduces load time.

The Video : Clip pattern is the model: a singular sidebar identity, with immutable per-recording children.

## Snapshot Rule

On Clip persist, auto-pin the Active Diagram's head into a new DiagramSnapshot iff **all three** hold:

1. **Active Diagram** is non-null.
2. `clip.scene !== "Camera"` (the OBS scene already captured at `clips.scene`).
3. The diagram window received at least one focus event during the Optimistic Clip's lifetime, forwarded to the parent CVM window via `postMessage`.

Content-hash dedup per Diagram: hash the canonical scene JSON; if a snapshot with that hash already exists for this Diagram, reuse it. Auto-pin is applied without confirmation but is reversible via per-Clip "unpin" / "attach Diagram" actions. The two-of-three reversal affordances mean the predicate doesn't have to be perfect — only right most of the time.

Rejected: an explicit "checkpoint" button (reintroduces the forgot-to-save problem we're fixing). Rejected: full edit-history snapshotting (overkill; what matters is "what was on screen for this clip", not keystrokes). Rejected: OR-combining scene and focus signals (too noisy — non-Camera scenes can show code, terminal, etc. without the diagram being the subject).

## Preservation

A snapshot stays visible in its Diagram's timeline iff it is **Preserved** (manually saved via the playground's "Preserve snapshot" action) **or** at least one non-archived Clip pins to it. Preservation is a `boolean` flag, not an origin marker — dedup may match an auto-pin against an earlier Preserved Snapshot, in which case the row picks up a Clip pin and remains preserved. Filtering happens at query time; rows are never hard-deleted.

Rejected "Manual" or "Saved" as the term: those describe creation gesture, not the persistent property. "Preserved" names what's actually true about the row.

## Window architecture

The playground runs in a separate browser window spawned via `window.open('/diagram-playground', 'cvm-diagrams', …)`. The named target makes reopening idempotent within a parent session: the parent holds a `Window` handle and, on subsequent "open playground" actions, calls `.focus()` on the live handle instead of re-invoking `window.open`. Re-invoking on a live handle would reload the child and discard in-progress TLDraw edits the autosave hasn't flushed yet. Cross-parent-reload re-acquisition is a separate path: a fresh parent re-establishes the postMessage channel after the child re-handshakes.

Same origin → unrestricted `postMessage`. The **server is source of truth for `headScene`**: the diagram window debounce-autosaves head to an API; the parent never proxies scene JSON. At Clip persist time, the parent posts `flush`, awaits `flushAck`, then hits the snapshot endpoint which reads the current head server-side. `flushAck` carries no payload — it is purely a timing signal. Piping scene JSON through `postMessage` would create a second source of truth and would have to be reconciled against the server anyway.

Rejected: single-window detachable pane. OS-level window focus is the real signal — trying to detect "is the user looking at this pane" from inside a single tab is brittle (focus events fire on hover). Rejected: parent proxies the scene over `postMessage`. The diagram needs to survive a window close anyway, so head must be server-persisted; once it is, there's no point routing reads through the parent.

## What gets persisted

TLDraw's `getSnapshot(editor.store)` returns `{ document, session }`. We persist `document` only — both for `headScene` autosaves and for DiagramSnapshot scenes. `document` is `{ store, schema }`: the shape data plus the TLDraw schema version it was authored against. `session` carries camera position, selection, focus mode, and other per-window UI state that has no place in a Diagram's identity.

The `schema` field rides along inside `document` and is **not stripped**. TLDraw uses it to migrate older snapshots forward on load when the SDK upgrades. Stripping it for byte savings would forfeit forward-compatibility on SDK upgrades. Historical DiagramSnapshots are read-migrated in memory; the stored bytes remain as-recorded so immutability is strict.

One consequence: content-hash dedup is over the canonical JSON of `document`, which includes `schema`. A semantically-identical scene authored against two different TLDraw schema versions will produce different hashes and will not dedup across versions. Dedup is an optimization, not a correctness property, so this is acceptable.

## Asset policy for v1

v1 is **vector + text only**. TLDraw's image / video / embed tools are disabled in the playground. Pasting an image surfaces a visible warning ("Assets are not yet supported in CVM diagrams") rather than silently inlining base64 into the scene.

Rejected for v1: inline-as-base64 (silently bloats every snapshot row that contains the image, multiplied across per-Clip snapshots). Rejected for v1: full Cloudinary upload flow (orthogonal scope — own auth, own upload path, own GC semantics for orphaned assets when snapshots are filtered out). The Diagram data model is agnostic about asset storage: assets in TLDraw are addressed by `assetId` references, so a future migration from "no assets" to "external assets" is a config change in the playground, not a schema change.

## Invariants

- A Diagram's `headScene` is mutable; a DiagramSnapshot's `scene` is immutable.
- `(diagramId, contentHash)` is unique on `diagramSnapshots`.
- A Clip pins to **at most one** snapshot (`clips.diagramSnapshotId` is a single nullable FK, not a join table). Multi-Diagram-per-Clip is explicitly deferred.
- Restoring a snapshot to head overwrites `headScene` only; the snapshot row is never mutated.
- A Diagram with zero snapshots is legal — it's just a new, unused lineage, mirroring how a **Video** with no Clips is legal.
- A Diagram is independent of the Course hierarchy and can be referenced from Clips in any Video, including a **Standalone Video**.

## Out of scope

- Full-text search over `clips.text` for transcript-based diagram lookup (sidebar filter is name-only for v1).
- Multi-Diagram per Clip.
- Hard-deletion of snapshots.
- Manual reorder of the sidebar (default sort is recency of last Clip pin or last `headScene` edit, whichever is newer).
- Asset uploads (images, embeds) — see "Asset policy for v1" above.
