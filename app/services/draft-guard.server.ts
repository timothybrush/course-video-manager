import type { Database } from "@/services/drizzle-service.server";
import {
  chapters,
  clips,
  clipWebLinks,
  courseVersions,
  lessons,
  sections,
  videos,
} from "@/db/schema";
import {
  UnknownDBServiceError,
  VersionNotDraftError,
} from "@/services/db-service-errors";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import type { ClipServiceEvent } from "@/services/clip-service";

/**
 * Write-closure guards for the CourseVersion lifecycle (issue #1348).
 *
 * Only a Draft Version (`commitState === "draft"`) accepts section / lesson /
 * video / clip writes; Pending and Published Versions are immutable. Each DB
 * write entry point resolves its target's owning CourseVersion through one of
 * these guards and fails with a typed VersionNotDraftError when the version is
 * not a Draft.
 *
 * Resolution rules:
 * - A target that does not exist passes through — the write itself no-ops or
 *   raises its own NotFoundError, exactly as before the guard existed.
 * - A Video with no Lesson (standalone / pitch-bound) belongs to no
 *   CourseVersion, so no closure applies and the guard passes.
 */

const makeDbCall = <T>(fn: () => Promise<T>) =>
  Effect.tryPromise({
    try: fn,
    catch: (cause) => new UnknownDBServiceError({ cause }),
  });

const assertDraft = (
  version: { id: string; commitState: string } | null | undefined
) =>
  version && version.commitState !== "draft"
    ? Effect.fail(
        new VersionNotDraftError({
          versionId: version.id,
          commitState: version.commitState,
        })
      )
    : Effect.void;

/** Guard a write scoped directly to a CourseVersion id. */
export const requireDraftVersion = Effect.fn("requireDraftVersion")(function* (
  db: Database,
  versionId: string
) {
  const version = yield* makeDbCall(() =>
    db.query.courseVersions.findFirst({
      where: eq(courseVersions.id, versionId),
      columns: { id: true, commitState: true },
    })
  );
  yield* assertDraft(version);
});

/** Guard a write scoped to a Section. */
export const requireDraftVersionForSection = Effect.fn(
  "requireDraftVersionForSection"
)(function* (db: Database, sectionId: string) {
  const section = yield* makeDbCall(() =>
    db.query.sections.findFirst({
      where: eq(sections.id, sectionId),
      columns: { id: true },
      with: { repoVersion: { columns: { id: true, commitState: true } } },
    })
  );
  yield* assertDraft(section?.repoVersion);
});

/** Guard a write scoped to a Lesson. */
export const requireDraftVersionForLesson = Effect.fn(
  "requireDraftVersionForLesson"
)(function* (db: Database, lessonId: string) {
  const lesson = yield* makeDbCall(() =>
    db.query.lessons.findFirst({
      where: eq(lessons.id, lessonId),
      columns: { id: true },
      with: {
        section: {
          columns: { id: true },
          with: { repoVersion: { columns: { id: true, commitState: true } } },
        },
      },
    })
  );
  yield* assertDraft(lesson?.section?.repoVersion);
});

/** Guard a write scoped to a Video (passes for standalone/pitch videos). */
export const requireDraftVersionForVideo = Effect.fn(
  "requireDraftVersionForVideo"
)(function* (db: Database, videoId: string) {
  const video = yield* makeDbCall(() =>
    db.query.videos.findFirst({
      where: eq(videos.id, videoId),
      columns: { id: true },
      with: {
        lesson: {
          columns: { id: true },
          with: {
            section: {
              columns: { id: true },
              with: {
                repoVersion: { columns: { id: true, commitState: true } },
              },
            },
          },
        },
      },
    })
  );
  yield* assertDraft(video?.lesson?.section?.repoVersion);
});

/** Guard a write scoped to a Clip. */
export const requireDraftVersionForClip = Effect.fn(
  "requireDraftVersionForClip"
)(function* (db: Database, clipId: string) {
  const clip = yield* makeDbCall(() =>
    db.query.clips.findFirst({
      where: eq(clips.id, clipId),
      columns: { id: true, videoId: true },
    })
  );
  if (!clip) return;
  yield* requireDraftVersionForVideo(db, clip.videoId);
});

/** Guard a write scoped to a Chapter. */
export const requireDraftVersionForChapter = Effect.fn(
  "requireDraftVersionForChapter"
)(function* (db: Database, chapterId: string) {
  const chapter = yield* makeDbCall(() =>
    db.query.chapters.findFirst({
      where: eq(chapters.id, chapterId),
      columns: { id: true, videoId: true },
    })
  );
  if (!chapter) return;
  yield* requireDraftVersionForVideo(db, chapter.videoId);
});

/**
 * Write-closure for the clip-service handler, which writes to the DB directly
 * instead of going through the guarded ops services: resolve a write event's
 * target and refuse it when the owning CourseVersion is not a Draft. Read
 * events and events that only create standalone videos pass straight through.
 */
export const requireDraftForClipServiceEvent = Effect.fn(
  "requireDraftForClipServiceEvent"
)(function* (db: Database, event: ClipServiceEvent) {
  switch (event.type) {
    case "append-clips":
    case "append-from-obs":
    case "create-chapter-at-insertion-point":
    case "create-chapter-at-position":
    case "create-effect-clip-at-position":
    case "regenerate-chapters":
      return yield* requireDraftVersionForVideo(db, event.input.videoId);
    case "archive-clips":
    case "unarchive-clips":
      // A batch always targets one video; resolve via the first clip.
      if (event.clipIds[0]) {
        return yield* requireDraftVersionForClip(db, event.clipIds[0]);
      }
      return;
    case "update-clips":
      if (event.clips[0]) {
        return yield* requireDraftVersionForClip(db, event.clips[0].id);
      }
      return;
    case "update-pause":
    case "reorder-clip":
      return yield* requireDraftVersionForClip(db, event.clipId);
    case "update-chapter":
    case "reorder-chapter":
      return yield* requireDraftVersionForChapter(db, event.chapterId);
    case "archive-chapters":
      if (event.chapterIds[0]) {
        return yield* requireDraftVersionForChapter(db, event.chapterIds[0]);
      }
      return;
    default:
      return;
  }
});

/** Guard a write scoped to a Clip web link. */
export const requireDraftVersionForClipWebLink = Effect.fn(
  "requireDraftVersionForClipWebLink"
)(function* (db: Database, linkId: string) {
  const link = yield* makeDbCall(() =>
    db.query.clipWebLinks.findFirst({
      where: eq(clipWebLinks.id, linkId),
      columns: { id: true, clipId: true },
    })
  );
  if (!link) return;
  yield* requireDraftVersionForClip(db, link.clipId);
});
