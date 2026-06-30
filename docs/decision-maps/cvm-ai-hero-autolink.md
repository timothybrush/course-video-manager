# Decision Map: CVM → AI Hero CMS auto-link (`course.json`)

Goal: make AI Hero CMS content updatable **directly from CVM**. The mechanism is an
aggregated `course.json` (every section/lesson/video + all text) emitted into the
existing Dropbox publish, which AI Hero ingests. The blocking prerequisite: CVM
currently has **no way to attach body text or an SEO description to a video** — that
content must become first-class, DB-owned and editable in CVM before the export is
meaningful. Origin: Slack DMs with Joel (June 18), Todoist "CVM -> AI Hero CMS Auto Link".

## Grounding (from codebase exploration, 2026-06-30)

- **Stack:** React Router v7 + Drizzle/Postgres + **Effect v3**. Domain: Course →
  CourseVersion (Draft/Published) → Section → Lesson → Video → {Clips, Chapters, Segments}.
- **Problem/Solution/Explainer are _videos_ under a lesson** (`video.path` ∈
  `explainer|problem|solution`; on disk `<lesson>/<videoPath>/readme.md`). A CVM lesson
  already _is_ the AI Hero lesson; its videos are the lesson's parts.
- **`videos` table has NO body/description column.** `lessons` has `title` + an
  **internal-facing** `description`. `clips.text` holds transcript text.
- **Existing publish** `app/services/course-publish-service.ts` → `syncToDropbox` writes,
  per video, the `.mp4` + `<video>.transcript.md` + `<video>.meta.json` (chapters), copies
  repo `.md`/source files (incl. `<video>/readme.md`), writes `changelog.md`, and sweeps
  stale files. Target `DROPBOX_PATH/<courseName>/`. `ALLOWED_FILE_EXTENSIONS_FROM_REPO`
  includes `.md`.
- **AI Hero today** ingests a lesson `body` from the copied `readme.md` via a `sourcePath` +
  `contentSyncStatus` comment block embedded in the body. AI Hero lesson shape:
  `fields { title, body, description, slug, state, visibility, github, optional, prompt,
thumbnailTime }` + `resources[]` (problem videoResource pos 0, solution pos 1, each with
  `srt`/`transcript`/`chapters`/`muxAssetId`/`sourcePath`). See `docs/ai-hero-api.md`.
- **`cvm` CLI is read-only**, agent-facing (`app/cli/`) — NOT the home for writes.
- **VFS layer** (`app/services/vfs/`) already projects course→JSON incl. a shallow
  `course.json`, but it is agent-only and Zod-based — explicitly **NOT reused** here.
- **Per-video UI** tabs: Video / Write / Post(YouTube / X-LinkedIn / **AI Hero** / Skills
  Changelog / Newsletter), registered in `_app.videos.$videoId.tsx`. A
  `markdown-monaco-editor.tsx` component already exists.

## Resolved inline (do not re-litigate)

Decided in the map-building `/grilling`. These are the spine; the tickets fill in the fog.

- **R1 — Source of truth = CVM database**, not the on-disk `readme.md`.
- **R2 — Two new columns on `videos`: `body` (markdown) + `description` (SEO).**
  `lesson.description` is internal-facing and stays untouched. The SEO `description` is
  **per-video** (a new field, not a reuse of `lesson.description`).
- **R3 — On publish, CVM _writes_ a derived `<video>.body.md`** (alongside the existing
  `<video>.transcript.md` / `<video>.meta.json`) from `video.body`. The source `readme.md`
  is left alone. `course.json` is **additive** — it does not replace the `readme.md`
  channel yet; an AI-Hero cutover to `course.json` is its own (fogged) ticket.
- **R4 — `course.json` contract = Effect v3 + Effect Schema.** Do **not** reuse the VFS
  layer. Stay on Effect 3 (no v3→v4 bridge to Joel's stack). Emit inside `syncToDropbox`.
- **R5 — The `video.body` editor is a _field-bound modal writer_, not a new tab.** The
  long-form Post fields (AI Hero body, Skills Changelog body, Newsletter copy, and the new
  `video.body`) become click-to-edit: clicking the field opens a modal hosting the existing
  writer engine, preceded into the field's mode, and writes the result back on Apply. This
  supersedes the `body-editor-ui` ticket. Spine decided in the `writable-field-modal`
  grilling (2026-06-30); see that ticket for D1–D6.

## writable-field-modal: Long-form Post fields edited via a field-bound modal writer

Blocked by: —
Status: resolved
Type: Grilling (resolved 2026-06-30)

### Question

(Supersedes the original `body-editor-ui` prototype: "where does the `video.body` + SEO
editor live — AI Hero sub-tab / new sub-tab / new top-level tab?") Reframed: should the
standalone Write page become a **field-bound modal** that opens when you click a long-form
Post text field, killing the write→localStorage→copy/paste tax? The writer
(`write-page.tsx` + `document-writing-agent.ts` + Monaco `document-panel.tsx`) is excellent
for authoring but decoupled from the fields it feeds.

### Answer

**Yes — adopt the field-bound modal writer.** Spine (do not re-litigate):

- **D1 — Field value _is_ the document.** Clicking a field seeds the modal's document with
  the field's current text; the agent edits _that_; on accept it's written back. No separate
  writer-document; the field's own persisted value is the document. (Bidirectional, not
  "compose then insert".)
- **D2 — Deprecate the standalone `/write` page.** Remove it from all routes + nav, but
  **don't delete the code yet.** Its field-less modes (`brainstorming`, `scoping-*`,
  `interview-*`, lesson README-on-disk writing) go dark temporarily — parked, not rehomed.
- **D3 — Conversation keyed `(videoId, fieldId, mode)`.** Each writable field carries a
  stable `fieldId` (e.g. `ai-hero-body`); two fields sharing a mode get separate threads;
  a multi-mode field gets one thread per mode. No separate document-storage slot.
- **D4 — MVP scope = long-form/document fields only:** AI Hero body, Skills Changelog body,
  Newsletter copy, and the new `video.body`. Short inputs (titles, SEO descriptions, X
  caption) **stay as plain text inputs** — deferred (see `short-fields-modal`). This avoids
  promoting chat-only modes to document modes; every in-scope field already maps to a real
  document mode (`article` / `skill-building` / `newsletter`).
- **D5 — Working-copy + explicit Apply.** Modal opens on a copy; agent edits the copy;
  Apply writes back through the field's existing persistence/overwrite flow
  (`post-page-overwrite-dialog.tsx` untouched); close-without-Apply discards; conversation
  history persists either way. No live mutation of the field mid-edit.
- **D6 — Mode set via prop: `modes: Mode[]`.** One mode → no selector, preceded straight in.
  Multiple → constrained selector (reuse `WriteModeDropdown` filtered to the list). Host
  field owns the menu; the component is dumb.

Implementation fog opened below: `writer-engine-extract`, `writable-field-component`,
`deprecate-write-route`, `short-fields-modal` (FOG).

## writer-engine-extract: Make the writer mountable inside a modal

Blocked by: —
Status: open
Type: Prototype

### Question

Extract the writer engine — the document-agent loop (`document-writing-agent.ts` +
`use-document-flow.ts`), conversation/document storage (`write-utils.ts`), the chat
(`WriteChat`), and the `DocumentPanel`/`markdown-monaco-editor.tsx` — out of the fullscreen
`write-page.tsx` route shell so it can mount inside a `Dialog`/`Sheet`. Decide the seam:
what the engine needs injected (videoId, fieldId, mode set, initial document, course
context from the loader) vs. what it owns. Prototype the modal shell to confirm the 3-pane
workspace survives at modal size (or collapses to chat + document for the field case).

### Answer

_unresolved_

## writable-field-component: The `<WritableField>` contract + wire the in-scope fields

Blocked by: writer-engine-extract
Status: open
Type: Grilling

### Question

Define the React component that wraps a long-form Post field: props (`fieldId`, `modes`,
current value, onApply), click-to-open behaviour, working-copy + Apply (D5), conversation
keyed `(videoId, fieldId, mode)` (D3), seed-value-as-document (D1), constrained selector
(D6). Then wire the four in-scope fields (AI Hero body, Skills Changelog body, Newsletter
copy, `video.body`) to their modes and stable `fieldId`s. Resolve how the new `video.body`
field's value is loaded/persisted (the R2 column → action/service write path).

### Answer

_unresolved_

## deprecate-write-route: Unroute the standalone Write page (keep code)

Blocked by: writable-field-component
Status: open
Type: Grilling

### Question

Remove `/write` (`_app.videos.$videoId.write.tsx`) from routing + any nav/tab entry, leaving
the source in place (D2). Sequenced **after** the modal covers the field cases so nothing is
orphaned prematurely. Confirm what breaks (deep links, the "Go Live" interview entry, lesson
README writing) and what the temporary loss of the field-less modes costs.

### Answer

_unresolved_

## short-fields-modal: Bring short Post inputs into the modal (FOG — beyond MVP)

Blocked by: writable-field-component
Status: open
Type: Grilling

### Question

Extend the field-bound modal to the short inputs deferred in D4 (YouTube title/description,
SEO description, X caption). Requires resolving how chat-only modes (`youtube-title`,
`seo-description`, …) operate when the field _is_ the document — i.e. promote them to the
document-agent edit-tool path, or a lighter single-line variant. Kept fogged until the
long-form `writable-field-component` ships and proves the pattern.

### Answer

_unresolved_

## course-json-shape: The `course.json` Effect Schema contract

Blocked by: —
Status: open
Type: Grilling

### Question

Define the exact aggregated document: field names; how explainer/problem/solution videos
nest under a lesson; whether the shape **mirrors the CVM domain** or **pre-maps to AI Hero's**
`fields`/`resources`/`tags`/`parentResources` shape; Draft-only vs versioned; where
transcripts/chapters/meta live in the document; how `body` + SEO `description` are carried.
Encode/decode boundary via Effect v3 `Schema`. (R2/R4 already fix the tech + fields.)

### Answer

_unresolved_

## description-backfill: Where do the initial SEO descriptions come from?

Blocked by: —
Status: open
Type: Research

### Question

AI Hero already stores per-lesson `description` values. Options: backfill `video.description`
from AI Hero (and define the lesson→video mapping for problem/solution lessons, since AI Hero
holds one description per lesson and CVM stores one per video), or leave blank for manual
authoring. Check coverage/quality via `wiki aihero` before deciding.

### Answer

_unresolved_

## readme-migration: One-time import of existing `readme.md` → `video.body`

Blocked by: —
Status: open
Type: Grilling

### Question

Mechanics of seeding `video.body` from the ~68-per-course existing
`<lesson>/<videoPath>/readme.md` files: matching logic (folder `explainer|problem|solution`
→ video; note on-disk lowercase folder vs capitalised `video.name`), lossless verification by
regenerate-and-diff against `<video>.body.md`, what happens to the now-redundant source
`readme.md` afterward, and scope (which/how many courses migrate).

### Answer

_unresolved_

## aihero-cutover: Switch AI Hero to ingest `course.json` as the source (FOG — beyond MVP)

Blocked by: course-json-shape
Status: open
Type: Research

### Question

Whether/when AI Hero stops ingesting per-file `readme.md` (via `sourcePath`) and instead reads
the aggregated `course.json` as the single source. Cross-team coordination with Joel/Vojta;
out of scope for the CVM-side MVP. Kept fogged until `course-json-shape` resolves.

### Answer

_unresolved_
