import { Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { SegmentOperationsService } from "@/services/db-segment-operations.server";
import { detail, emitNdjson } from "@/cli/helpers";

/**
 * `segment` — the film-time planning units of a single Video.
 *
 * A Segment is one planning unit of a Video's plan: an ordered, pre-recording
 * sketch of "what this video will do for the viewer". A Video's plan is an
 * ordered sequence of Segments authored BEFORE the video is recorded — planning
 * a video means choosing "one of these, then one of these". Segments are a
 * first-class entity that belongs to a Video (not the Lesson or Pitch), so each
 * Video carries its own plan and duplicating a Video copies its Segments. A
 * Segment can be moved between Videos (reassigning its parent Video), which is
 * why `videoId` is mutable.
 *
 * A Segment is DELIBERATELY DISTINCT from a Chapter and a Clip: a Chapter is a
 * recorded-timeline grouping that maps 1:1 to YouTube and groups Clips, whereas
 * a Segment is the INTENDED structure and need not correspond to any Chapter or
 * Clip. Two separate views: "what I planned to shoot" (Segments) vs "what I
 * actually shot" (Clips / Chapters).
 *
 * A Segment's `kind` is the film-time job it does, drawn from the Mise en Place
 * glossary. Five kinds:
 *   - definition   — Explain a concept, term, or idea.
 *   - walkthrough  — Step through existing code or a process.
 *   - playthrough  — Build something live, start to finish.
 *   - quest        — Set the viewer a challenge to attempt.
 *   - reaction     — React to or review code or content.
 *
 * Segments are PURELY an in-app authoring aid — neither the Segment plan nor a
 * Segment's free-text `description` is ever published (Publish skips them).
 *
 * Addressing: Segments have no stable public address and no get-by-id verb —
 * they only exist relative to their Video. List them with the required
 * `--video <videoId>` flag (find a video id via `cvm video list` or
 * `cvm video tree <id>`).
 *
 * Output fields (per segment row):
 *   - id          — the Segment's id.
 *   - videoId     — the parent Video this Segment belongs to (mutable: a Segment
 *                   can be dragged into another Video).
 *   - kind        — one of the five Segment kinds above (the film-time job).
 *   - title       — short label for the Segment (may be empty "").
 *   - description — free-text planning note ("what I'm going to do/say here").
 *                   Never published; may be empty "".
 *   - order       — fractional-index sort key; list output is already sorted by
 *                   it (ascending = plan order).
 *   - archived    — always false in list output (archived == deleted for
 *                   Segments; they are always filtered out and never visible).
 *   - createdAt   — when the Segment was created.
 *
 * Verbs:
 *   list --video <id>   List a Video's full, ordered Segment plan (active only).
 *
 * There is no `get`, no `tree`, and no `--archived` flag for Segments: archived
 * Segments are deleted Segments and are never viewable.
 *
 * Examples:
 *   # The full ordered plan for a video, one segment per line (NDJSON):
 *   cvm segment list --video vid_123
 *
 *   # Just the kinds, in order:
 *   cvm segment list --video vid_123 | jq -r '.kind'
 *
 *   # Titles of every "quest" segment in a video:
 *   cvm segment list --video vid_123 | jq -r 'select(.kind=="quest") | .title'
 *
 *   # Find a video id first, then list its plan:
 *   cvm video tree lesson_456 | jq -r '.children[].id'
 *   cvm segment list --video vid_123
 */
const HELP = `Segment — the film-time planning units of a single Video.

A Segment is one unit of a Video's PLAN: an ordered, pre-recording sketch of
"what this video does for the viewer", authored before the video is recorded.
Segments belong to a Video (not the Lesson/Pitch); each Video carries its own
plan and a Segment can be moved between Videos (its parent videoId is mutable).

Deliberately distinct from a Chapter/Clip: a Segment is the INTENDED structure
("what I planned to shoot") and need not map to any recorded Chapter or Clip
("what I shot"). Segments are an in-app authoring aid and are NEVER published.

Segment kinds (the film-time job, from the Mise en Place glossary):
  definition   Explain a concept, term, or idea
  walkthrough  Step through existing code or a process
  playthrough  Build something live, start to finish
  quest        Set the viewer a challenge to attempt
  reaction     React to or review code or content

Output fields: id, videoId, kind, title, description (free-text planning note,
never published), order (fractional sort key — list is pre-sorted ascending),
archived (always false), createdAt.

Segments have NO get-by-id, NO tree, and NO --archived flag (archived == deleted
== always hidden). They are only addressable relative to their Video.

Verbs:
  list --video <id>   A Video's full ordered Segment plan (active only)

Examples:
  cvm segment list --video vid_123
  cvm segment list --video vid_123 | jq -r '.kind'
  cvm segment list --video vid_123 | jq 'select(.kind=="quest")'`;

const LIST_HELP = `List a Video's full, ordered Segment plan as NDJSON (one compact JSON object
per line; empty plan prints nothing). Requires --video <videoId>.

The list is the COMPLETE active plan, already sorted by 'order' ascending (plan
order). Archived (deleted) Segments are always excluded — there is no flag to
include them.

Each line carries: id, videoId, kind (definition|walkthrough|playthrough|quest|
reaction), title, description (in-app planning note; never published), order
(fractional sort key), archived (always false), createdAt.

Find a video id with 'cvm video list' or 'cvm video tree <id>'.

Examples:
  cvm segment list --video vid_123
  cvm segment list --video vid_123 | jq -r '.title'
  cvm segment list --video vid_123 | jq -r 'select(.kind=="walkthrough") | .id'`;

const video = Options.text("video").pipe(
  Options.withDescription(
    "The parent Video id whose Segment plan to list (required)."
  )
);

const listCmd = Command.make("list", { video }, ({ video }) =>
  Effect.gen(function* () {
    const svc = yield* SegmentOperationsService;
    const rows = yield* svc.listSegmentsByVideoId(video);
    yield* emitNdjson(rows);
  })
).pipe(Command.withDescription(detail(LIST_HELP)));

export const segmentCommand = Command.make("segment").pipe(
  Command.withDescription(detail(HELP)),
  Command.withSubcommands([listCmd])
);
