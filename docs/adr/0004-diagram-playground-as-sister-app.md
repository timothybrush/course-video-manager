# Diagram Playground as a self-contained sister app

The **Diagram Playground** popup was previously a dumb canvas: it showed nothing unless the parent CVM window posted a `loadDiagram` message at it. Diagram browsing, creation, and switching all lived in the parent app's `/diagrams` route. This produced a dead-end UX where opening the popup without a target (e.g. from the video editor's Actions menu) dropped the user into an empty window with no controls.

Decision: reshape the popup as a **self-contained sister app** with its own browse/pick/create capabilities. The parent CVM window connects to it via deep links and a postMessage protocol, but does not own Diagram selection. The parent's `/diagrams` route is removed; the app sidebar entry becomes a pure launcher.

Rejected: a mirrored model where both the parent route and the popup offer the same capabilities. A single canonical home for Diagrams is easier to reason about and matches how Diagrams are _already_ conceptually independent of the Course hierarchy (per ADR 0003).

## Two modes, two routes

The popup has two modes:

- **Playground Home** (`/diagram-playground`) — a grid of Diagram tiles with an inline "+ New Diagram" affordance. The popup is in this mode iff there is no **Active Diagram**.
- **Active** (`/diagram-playground/:diagramId`) — the existing canvas + right-side **Snapshot Timeline** experience.

Mode is encoded in the URL rather than client-only state so that (a) refreshing the popup preserves the active Diagram, and (b) `openPlaygroundWithDiagram(id)` becomes a straight `window.open('/diagram-playground/' + id, …)` call without needing the `pendingDiagramId` + `ready` handshake to inject the first diagram. The handshake survives only for the "popup already open, switch diagrams" case.

Rejected: a persistent left sidebar listing Diagrams alongside the canvas. The Playground doubles as a screen-recording surface — when the artist enters tldraw Focus Mode, every pixel of chrome must disappear. A two-mode app keeps the active-canvas chrome minimal by construction, since when a Diagram is active the Diagrams picker is absent entirely.

## Identity flows via messages, content via the server

ADR 0003 already established that `headScene` is server-owned and never proxied through `postMessage`. This ADR extends that principle: Active Diagram _identity_ flows via a new `activeDiagramChanged` child→parent message, emitted whenever the popup's Active Diagram changes (initial load, in-popup switch, navigate back to Home → emits `null`). The parent updates its cached `_activeDiagramId` accordingly.

This matters for the **Snapshot Rule** (ADR 0003): the parent must know the Active Diagram at Clip persist time to auto-pin. With in-popup switching now a first-class flow, the previous "set only by `openPlaygroundWithDiagram`" cache would silently go stale.

Rejected: parent polls the popup with a request/response message. Rejected: server-tracked focus session keyed by window id. Both heavier than the simple one-way notification.

## Resolving "Open Diagram Playground" actions

Two affordances exist in the video editor:

- **Per-clip action** — opens the Diagram pinned to _that_ clip via `clip.diagramSnapshotId`.
- **Per-video action** (Actions dropdown on the whole video) — resolves to the **Insertion Point**, walks backwards through clips (never forward), finds the nearest clip with a `diagramSnapshotId`, and opens that Diagram.

Both follow a single rule: **never disable, always land somewhere**. Specificity degrades gracefully: clip's pin → video's nearest preceding pin → **Playground Home**. The artist invoking "Open Diagram Playground" before any clips have been filmed (or against a clip with no pin) is a legitimate plan-before-filming flow and must not be blocked.

## Playground Home tiles

Each tile shows the Diagram's name plus a thumbnail of one DiagramSnapshot. The snapshot is picked as the **filtered-newest**: apply the ADR 0003 timeline-visibility filter (Preserved OR has at least one non-archived pinning Clip), then take the newest by `createdAt`. If no snapshot passes the filter, the tile renders blank — thumbnails are snapshot artifacts and are never derived from `headScene`.

This keeps Home consistent with what the artist sees inside the active-mode timeline: Home never advertises a snapshot the timeline would hide.

Sort order across tiles stays per ADR 0003 (recency of last Clip pin or last `headScene` edit, whichever is newer). Search/filter on Home is deferred for v1.

Creation is inline: a "+ New Diagram" tile creates a Diagram named `"Untitled diagram"` and immediately navigates to `/diagram-playground/:newId`. Rejected: name-first modal — friction every time, and the artist will rename inline anyway.

## Out of scope

- Search/filter on Playground Home.
- Multi-window playgrounds (still one named target `cvm-diagrams`).
- Standalone web-shareable Diagram links — the URL works as a popup-internal deep link, not a public surface.
