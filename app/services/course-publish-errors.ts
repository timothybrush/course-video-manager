import { Data } from "effect";

export class PublishValidationError extends Data.TaggedError(
  "PublishValidationError"
)<{
  courseViewLintCount?: number;
  failedExportVideoIds?: string[];
  missingVideoIds?: string[];
  unfrozenCourseVersionId?: string;
}> {}

export class DropboxCommitPendingError extends Data.TaggedError(
  "DropboxCommitPendingError"
)<{
  publishedVersionId: string;
  newDraftVersionId: string;
  reason: "sync_failed" | "missing_assets";
  includeTodoLessons: boolean;
  missingVideoIds?: string[];
}> {}

export class ExportError extends Data.TaggedError("ExportError")<{
  message: string;
}> {}
