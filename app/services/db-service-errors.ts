import { Data } from "effect";

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  type: string;
  params: object;
  message?: string;
}> {}

export class UnknownDBServiceError extends Data.TaggedError(
  "UnknownDBServiceError"
)<{
  cause: unknown;
}> {}

export class NotLatestVersionError extends Data.TaggedError(
  "NotLatestVersionError"
)<{
  sourceVersionId: string;
  latestVersionId: string;
}> {}

export class CannotUpdatePublishedVersionError extends Data.TaggedError(
  "CannotUpdatePublishedVersionError"
)<{
  versionId: string;
}> {}

/**
 * Write-closure: only a Draft Version accepts section/lesson/video/clip
 * writes. A Pending or Published Version is immutable, and every DB-mutation
 * entry point rejects writes into one with this error (see issue #1348).
 */
export class VersionNotDraftError extends Data.TaggedError(
  "VersionNotDraftError"
)<{
  versionId: string;
  commitState: string;
}> {}

/**
 * Promote and Discard act only on a Pending Version — Promote marks it
 * Published once the Dropbox `course.json` rename (the commit receipt) lands,
 * and Discard deletes it. Neither may ever touch a Draft or Published row.
 */
export class VersionNotPendingError extends Data.TaggedError(
  "VersionNotPendingError"
)<{
  versionId: string;
  commitState: string;
}> {}

/**
 * At most one Pending Version may exist per course. Submit refuses to stack a
 * second Pending on top of one left behind by a crash in the receipt→Promote
 * gap; reconcile-on-load (issue #1404) heals the stale one first.
 */
export class PendingVersionExistsError extends Data.TaggedError(
  "PendingVersionExistsError"
)<{
  repoId: string;
  pendingVersionId: string;
}> {}

export class CannotArchiveLessonVideoError extends Data.TaggedError(
  "CannotArchiveLessonVideoError"
)<{
  videoId: string;
  lessonId: string;
}> {}

export class CourseNameTakenError extends Data.TaggedError(
  "CourseNameTakenError"
)<{
  name: string;
  slug: string;
  message: string;
}> {}

export class SectionPathTakenError extends Data.TaggedError(
  "SectionPathTakenError"
)<{
  path: string;
  message: string;
}> {}

export class LessonPathTakenError extends Data.TaggedError(
  "LessonPathTakenError"
)<{
  path: string;
  message: string;
}> {}

export class VideoTitleTakenError extends Data.TaggedError(
  "VideoTitleTakenError"
)<{
  title: string;
  message: string;
}> {}
