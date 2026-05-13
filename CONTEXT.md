# Course Video Manager

A tool for authoring courses as structured collections of sections, lessons, and videos — backed by a git repo on disk and published as immutable snapshots.

## Language

### Course structure

**Course**:
The primary domain entity: a structured collection of versions, sections, lessons, and videos, stored in the database.
_Avoid_: Repo (as domain entity), Project

**CourseRepo**:
The local git repository on disk that backs a course, referenced by the course's `repoPath`.
_Avoid_: Repo (ambiguous without "Course" prefix)

**Section**:
A directory-backed grouping of lessons within a course version, ordered by fractional index.
_Avoid_: Module, Chapter, Unit

**Lesson**:
A single learning unit within a section, corresponding to a folder on disk.
_Avoid_: Exercise, Tutorial, Step

### Course versions

**CourseVersion**:
A snapshot of a course's section/lesson/video structure at a point in time; either a Draft Version or a Published Version.
_Avoid_: Version (too vague), Revision

**Draft Version**:
The single mutable CourseVersion that is currently being edited; always the latest by `createdAt`; has no name or description.
_Avoid_: Current version, Working version

**Published Version**:
An immutable CourseVersion with a name and description, created by the Publish flow; cannot be deleted.
_Avoid_: Released version, Committed version

**Publish**:
The atomic operation that uploads to Dropbox, freezes the Draft Version as a Published Version (setting name/description), and clones a new Draft Version.
_Avoid_: Commit, Deploy, Push

**Export Version Key**:
A hardcoded constant in the codebase (`EXPORT_VERSION`) that, when bumped, invalidates all video export hashes and forces re-export.
_Avoid_: Version number, Build version

### Ghost entities

**Ghost Lesson**:
A lesson that exists in the database but not yet on the file system (`fsStatus = "ghost"`).
_Avoid_: Planned lesson, Draft lesson

**Ghost Section**:
A section that exists in the database but not yet on the file system.
_Avoid_: Planned section

**Ghost Course**:
A course with no file path (`filePath = NULL`); exists only in the database as a planning space.
_Avoid_: Planned course, Draft course

**Materialize**:
The act of transitioning a ghost entity to a real entity by creating its on-disk representation.
_Avoid_: Create on disk, Realize

**Materialization Cascade**:
The chain reaction when materializing a lesson inside a ghost course: assigns file path to course, materializes section, then materializes lesson — all in one flow.

### Authoring lifecycle

**Lesson Authoring Status**:
A per-version marker on a real **Lesson** indicating where it sits in the authoring workflow. Two values: `todo` (default for newly created or materialized real lessons) and `done` (set by clicking the To-Do pill in the UI). Stored as `authoringStatus` on the lesson row and copied forward by `copyVersionStructure` at Publish, so a Published Version's lessons keep whatever status they had at publish time. Subject to a biconditional invariant with `fsStatus`: a real lesson always has a status, a **Ghost Lesson** never does. Distinct from `fsStatus` (filesystem presence) and from **Pitch Status** (which tracks pitches, not lessons).
_Avoid_: TODO flag, Lesson status (ambiguous with `fsStatus`), Completion

### Video and clips

**Video**:
A container of clips and clip sections that represents a single producible video output.
_Avoid_: Recording

**Standalone Video**:
A video with no lesson association (`lessonId = NULL`), used for reference or temporary content.
_Avoid_: Orphan video, Unlinked video

**Clip**:
A timestamped segment of source footage within a video, defined by start/end times and a source filename.
_Avoid_: Segment, Cut, Take

**Effect Clip**:
A special clip for non-speech content (white noise, transitions) manually inserted into the timeline.
_Avoid_: Filler, Spacer

**ClipSection**:
A named marker/divider within a video's timeline that visually groups related clips.
_Avoid_: Clip group, Divider, Marker (in authoring); Chapter (outside the export context)

**Optimistic Clip**:
A clip added to the frontend state during recording before it is persisted to the database.
_Avoid_: Pending clip, Temporary clip

### Video export and hashing

**Export Hash**:
A SHA256 hash derived from a video's clip filenames, timestamps, clip order, and the Export Version Key; determines whether a video needs re-export.
_Avoid_: Content hash, Video hash

**Exported Video**:
A rendered `.mp4` file on disk named `{courseId}-{exportHash}.mp4` in the finished videos directory.
_Avoid_: Finished video, Output video

**Unexported Video**:
A video whose current Export Hash does not match any file on disk; blocks publishing.
_Avoid_: Dirty video, Stale video

**Purge**:
The deliberate deletion of an Exported Video's `.mp4` file from disk, transitioning it back to an Unexported Video; reversible via re-export.
_Avoid_: Clear, Delete from file system, Unexport

### Recording

**Recording Session**:
A time-bounded window during which clips are captured via OBS, grouping optimistic clips before persistence.
_Avoid_: Session, Take session

**Pause Length**:
A per-Recording-Session setting (`short` or `long`) that controls how long a silence must last before it ends a clip. `short` (default) cuts on brief mid-sentence pauses; `long` only cuts on extended pauses. Locked at the start of recording and applied symmetrically to both the frontend speech detector and the backend FFmpeg silence detection.
_Avoid_: Silence mode, Silence sensitivity, Pause threshold

**Insertion Point**:
The position in a video timeline where new clips or clip sections will be added (start, after-clip, after-clip-section, end).
_Avoid_: Cursor, Drop target

**Transcription**:
The process of populating a clip's `text` field from its audio, tracked by `transcribedAt`.
_Avoid_: Caption, Subtitle

### Pitches

**Pitch**:
A reusable packaging artifact — the YouTube/newsletter/tweet copy and thumbnail concept for a video idea — authored _before_ the video itself is recorded. A Pitch is independent of the Course hierarchy; it relates only to **Standalone Videos**.
_Avoid_: Idea, Concept, Draft (overloaded with Draft Version)

**Pitch Status**:
A manual marker on a Pitch with five values, all user-set (none derived from linked Videos):

- `idle` (default) — drafting / mulling; not yet committed to making the video
- `scheduled` — queued in the external delivery calendar (Google Doc); not yet scheduled inside YouTube itself
- `shipped-to-youtube` — uploaded to YouTube and queued in YouTube's own scheduler; awaiting go-live and remaining channels (newsletter, tweet)
- `shipped` — fully delivered across channels; the Pitch is done
- `cancelled` — decided not to make this video; sideways off-ramp from any other state, reversible by flipping back to `idle`

Lifecycle ladder: `idle → scheduled → shipped-to-youtube → shipped`, with `cancelled` as a sideways off-ramp from any of them. `shipped` and `cancelled` are mutually exclusive. All transitions are reversible — the field is just a manual bookkeeping marker.

A Pitch can have any status independent of how many Videos are linked to it.

**Default Pitch Filter**:
The pitches index defaults to showing `idle + scheduled + shipped-to-youtube` — the "still on my desk" set. `shipped` and `cancelled` are hidden by default. When the filter equals this default set, the `status` URL param is omitted (bookmarks of `/pitches` survive future default changes).

### Reference video

**Reference Video**:
Another **Video** on the same **Lesson**, opened alongside the one being recorded so the author can read its **Clip** transcripts (grouped by **ClipSection**) while re-recording. Not a domain link — there's no FK; the candidate set is derived as "other non-archived Videos on this Lesson." Opt-in per editor session: hidden by default, added via the editor's actions menu ("Add Reference"), and removed the same way. The visible reference is whichever sibling the user picked; the panel never auto-selects. When the Lesson has no eligible siblings, the action is unavailable and the editor stays in its default two-column layout.
_Avoid_: Previous Take (implies take-history we don't model), Reference Take, Source Video

### Diagrams

**Diagram**:
A named, persistent identity in the diagrams sidebar — the "home" for a series of snapshots that evolve across the **Clips** it appears in. Conceptually a lineage, surfaced in the UI as a single item. Independent of the Course hierarchy; a Diagram can be referenced from Clips in any **Video** (lesson-bound or **Standalone Video**).
_Avoid_: Drawing, Sketch, Canvas, Scene (Scene is TLDraw's term for its scene JSON — reserved for that)

**DiagramSnapshot**:
An immutable capture of a Diagram's TLDraw scene at the moment a specific **Clip** was filmed. Pinned to a Clip so that returning to that Clip later surfaces the diagram state it was filmed against, even after the Diagram has been edited for subsequent clips.
_Avoid_: Frame, Revision, Checkpoint, Version (overloaded with **CourseVersion**)

**Active Diagram**:
The Diagram currently loaded into the playground's TLDraw canvas. May be `null` (empty playground). Set by clicking a Diagram in the sidebar (loads its `headScene` into the canvas) or by the "New Diagram" action; persists across **Clips** until changed.
_Avoid_: Current diagram, Open diagram

**Preserved Snapshot**:
A **DiagramSnapshot** flagged to remain visible in its Diagram's timeline regardless of whether any non-archived **Clip** pins to it. Created via the "Preserve snapshot" action in the playground, which forks `headScene` into a new snapshot independent of any Clip. Non-preserved snapshots disappear from the timeline if all their pinning Clips become archived; Preserved Snapshots do not. A snapshot can be both Preserved _and_ pinned by Clips (the two are independent reasons to keep it visible). Surfaced in the UI via a pill on the timeline thumbnail.
_Avoid_: Manual snapshot, Saved snapshot, Standalone snapshot, Bookmark

### Video destinations

**Skills Changelog**:
A published AI Hero entity that bundles an article and a Kit newsletter draft for a single **Video**. Created via `POST /api/skills/changelog`; publishes immediately (`state: "published"`) and triggers the Inngest `skill-changelog/published` event, which creates a Kit newsletter draft (template `5176054`, from `matt@aihero.dev`) — drafts only, never sends. The newsletter is required; the article and newsletter fields are authored together on a single page. Public page at `https://www.aihero.dev/skills/<slug>`; newsletter copy includes a hardcoded footer linking back to that page.
_Avoid_: Changelog (ambiguous with course publish changelog), Skill post, Changelog entry

### Ordering and lifecycle

**Fractional Index**:
A string-based ordering value that allows inserting items between existing items without reindexing siblings.
_Avoid_: Sort order, Position

**Archive**:
Soft-deletion: hiding an entity from active views while retaining it in the database.
_Avoid_: Delete, Remove

**ARCHIVE Section**:
A special section directory whose name ends in `ARCHIVE`, filtered out of the default course view.

## Relationships

- A **Course** is either a **Ghost Course** (no file path, planning-only) or backed by a **CourseRepo** on disk, referenced via `repoPath`
- A **Ghost Course** becomes a real **Course** permanently when a file path is assigned during **Materialization Cascade**; a real course never reverts to ghost
- A **Course** contains one or more **CourseVersions**
- A **Course** has exactly one **Draft Version** (the latest CourseVersion) and zero or more **Published Versions**
- A **CourseVersion** contains ordered **Sections**
- A **Section** contains ordered **Lessons**
- A **Lesson** contains zero or more **Videos** (ghost lessons have none)
- A real **Lesson** always has a **Lesson Authoring Status** (`todo` or `done`); a **Ghost Lesson** never does — converting between ghost and real sets or clears the status accordingly
- A **Video** contains ordered **Clips** and **ClipSections**, interleaved in a shared ordering space
- A **Video** with at least one **Clip** has an **Export Hash**; a video with no clips is not considered a real video
- An **Exported Video** file is shared across **CourseVersions** via `{courseId}-{exportHash}.mp4` naming — if clips haven't changed, the hash matches and no re-export is needed
- A **Standalone Video** belongs directly to a **Course** with no **Lesson** parent
- A **Recording Session** produces multiple **Optimistic Clips** that become **Clips** on persistence
- A **Pitch** is independent of the **Course** hierarchy; one **Pitch** can produce zero or more **Standalone Videos** via a `pitchId` FK on Video. Pitches never attach to lesson-bound Videos.
- A **Video** being edited can have at most one **Reference Video** open per editor session — another non-archived **Video** on the same **Lesson**, chosen manually via the editor's actions menu. Not persisted as a domain link.
- A **Diagram** contains an ordered series of **DiagramSnapshots** — its lineage over time
- A **DiagramSnapshot** is pinned to a **Clip** and captures the TLDraw scene at the moment that Clip was filmed; editing the Diagram later does not mutate prior snapshots
- A **DiagramSnapshot** may have zero Clip pins if it is a **Preserved Snapshot** (created explicitly) or if all its pinning Clips have been archived (in which case it is filtered from the timeline view)
- A **Diagram** is independent of the Course hierarchy and can be referenced from Clips in any Video, including a **Standalone Video**
- A **Video** can be published to a **Skills Changelog** (AI Hero article + required Kit newsletter draft) as a third destination alongside the YouTube post page and the AI Hero article page
- **Publishing** uploads to Dropbox, freezes the **Draft Version** into a **Published Version**, and creates a new **Draft Version** — all atomically (Dropbox upload must succeed first)

## Example dialogue

> **Dev:** "When a user wants to push changes to the course, what's the flow?"
> **Domain expert:** "They go to the Publish page. It shows them a changelog preview — the diff between the current **Draft Version** and the last **Published Version**. They enter a name and description, and hit Publish."

> **Dev:** "What if some videos haven't been exported yet?"
> **Domain expert:** "The Publish page checks every **Video** that has **Clips** for a matching **Exported Video** on disk. If any are **Unexported Videos**, the publish button is disabled and they see export buttons inline. A **Video** with no **Clips** is ignored — it's not a real video."

> **Dev:** "How does the system know if a video needs re-export?"
> **Domain expert:** "It computes the **Export Hash** from the clip filenames, timestamps, order, and the **Export Version Key**. Then it checks for `{courseId}-{exportHash}.mp4`. If the file exists, it's already exported. If not, it's an **Unexported Video**."

> **Dev:** "What happens when we bump the **Export Version Key**?"
> **Domain expert:** "Every video's **Export Hash** changes, so nothing matches on disk anymore. Everything becomes an **Unexported Video** and needs re-export."

> **Dev:** "What if I want to free up disk space without re-exporting everything?"
> **Domain expert:** "You can **Purge** — either a single video or all exports for a version. Purging deletes the `.mp4` from disk, so the video becomes an **Unexported Video** again. You can always re-export later."

> **Dev:** "After publishing, what happens to old exported files with stale hashes?"
> **Domain expert:** "Automatic cleanup happens at export time — we collect all valid **Export Hashes** across every **CourseVersion**, then delete any `{courseId}-*.mp4` files whose hash isn't in that set. That's different from a manual **Purge**, which is a deliberate user action."

> **Dev:** "And the **Published Version** is immutable? Can it be deleted?"
> **Domain expert:** "Correct. Once published, the version's name, description, and structure are frozen. It cannot be deleted. The **Draft Version** is always the only mutable version."

## Example dialogue: ghost courses

> **Dev:** "What if I want to plan a course but don't have a repo yet?"
> **Domain expert:** "Create a **Ghost Course** — just give it a name. You can add **Ghost Sections** and **Ghost Lessons** freely. It's pure planning, no filesystem needed."

> **Dev:** "What happens when I'm ready to commit one of those lessons to disk?"
> **Domain expert:** "Hit 'Create Real Lesson.' Since the course is a **Ghost Course**, it triggers a **Materialization Cascade** — a modal asks you to point at an existing directory for the file path. Then the **Course**, **Section**, and **Lesson** all **Materialize** in one step."

> **Dev:** "Can the course go back to ghost if I delete that lesson?"
> **Domain expert:** "No. Once a **Course** has a file path, it stays real forever. The repo on disk doesn't disappear just because you removed a lesson."

> **Dev:** "What about deleting a real lesson entirely — not converting to ghost?"
> **Domain expert:** "There's a 'Delete' action that purges from disk and removes from the database in one step. Separate from 'Convert to Ghost,' which keeps the planning entry."

## Flagged ambiguities

- **"Version"** — Used both for **CourseVersion** (structural snapshots) and implicitly for content history via `previousVersionLessonId`/`previousVersionSectionId` cross-references. These serve different purposes: one is a named milestone, the other is a migration link between versions. Now additionally distinguished as **Draft Version** vs **Published Version** by position (latest = draft).
- **Clips and ClipSections share an ordering space** — Both use the same `order` field with fractional indexing. The UI must treat them as a single interleaved list, not two separate collections. This is a source of complexity when inserting or reordering.
- **"Export Version Key" vs "CourseVersion"** — These are unrelated concepts that both use the word "version." The **Export Version Key** is a build-time constant for cache-busting video exports. A **CourseVersion** is a domain snapshot of course structure. Do not confuse them.
- **"Clear" / "Delete from file system"** (resolved) — Previously used interchangeably for removing exported video files. Now canonicalized as **Purge**. "Clear" described the mechanism (clearing files), not the domain action. **Purge** captures the intent: deliberately removing a cached render artifact to transition a video back to Unexported status.
- **`cancelled` (Pitch Status) vs `archived`** — Pitches use both, deliberately. `cancelled` is a _semantic_ state ("I decided not to make this video," reversible by un-cancelling). `archived` is a _presentation_ concern (hide from default views, applies regardless of status). They look similar but mean different things; deletion is a third, separate action. Easy to merge later if the distinction proves unused.
- **`scheduled` vs `shipped-to-youtube`** — Both involve a calendar. `scheduled` is the external Google Doc delivery calendar (Matt's own queue). `shipped-to-youtube` is YouTube's own publishing scheduler (the video is uploaded and queued there). The asymmetry exists because YouTube has its own scheduler but other channels (Twitter, newsletter) don't — so YT alone earns an intermediate "shipped" rung.
- **"Delete" for lessons** — "Delete" means two different things depending on context: for a **Ghost Lesson**, it removes the DB row. For a real **Lesson**, it purges from disk AND removes from DB. This is distinct from "Convert to Ghost" which only removes from disk. The UI should make the distinction clear through labeling.
