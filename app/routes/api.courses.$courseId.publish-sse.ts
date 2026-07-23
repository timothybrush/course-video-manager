import { Effect, Schema } from "effect";
import { runtimeLive } from "@/services/layer.server";
import type { Route } from "./+types/api.courses.$courseId.publish-sse";
import { CoursePublishService } from "@/services/course-publish-service";
import { createSSEResponse } from "@/lib/create-sse-response.server";

const publishSchema = Schema.Struct({
  name: Schema.String,
  // Required, like name: a Published Version always carries a description (it
  // feeds the changelog and the frozen snapshot). The publish page gates on a
  // non-empty value; this just refuses a payload that omits the field.
  description: Schema.String,
  includeTodoLessons: Schema.optional(Schema.Boolean),
});

export const action = async (args: Route.ActionArgs) => {
  const { courseId } = args.params;
  const body = await args.request.json();
  const parsed = Schema.decodeUnknownSync(publishSchema)(body);

  return createSSEResponse({
    runtime: runtimeLive,
    program: (sendEvent) =>
      Effect.gen(function* () {
        const publishService = yield* CoursePublishService;

        const result = yield* publishService.publish(
          courseId,
          parsed.name,
          parsed.description,
          parsed.includeTodoLessons ?? true,
          (stage) => {
            sendEvent("progress", { stage });
          }
        );

        sendEvent("complete", {
          publishedVersionId: result.publishedVersionId,
          newDraftVersionId: result.newDraftVersionId,
        });
      }),
    errorHandlers: [
      {
        tag: "PublishValidationError",
        handler: (e, sendEvent) => {
          const parts: string[] = [];
          if (e.courseViewLintCount && e.courseViewLintCount > 0) {
            parts.push(
              `${e.courseViewLintCount} course warning(s) must be fixed`
            );
          }
          if (e.failedExportVideoIds && e.failedExportVideoIds.length > 0) {
            parts.push(
              `${e.failedExportVideoIds.length} video(s) failed to export`
            );
          }
          sendEvent("error", {
            message: parts.join("; ") || "Publish validation failed",
            type: "validation",
            courseViewLintCount: e.courseViewLintCount ?? 0,
            failedExportVideoIds: e.failedExportVideoIds ?? [],
          });
        },
      },
      {
        // A caught Commit failure auto-Discards the Pending Version (issue
        // #1401) — this is a plain, terminal error, not a recoverable state.
        // The Submitted content lives on unchanged in the new Draft.
        tag: "PublishCommitFailedError",
        handler: (e, sendEvent) => {
          const message =
            e.reason === "missing_assets"
              ? `Publish discarded: ${
                  e.missingVideoIds?.length ?? 0
                } video file(s) were missing from the export directory. Nothing was lost — your edits are safe in the Draft. Re-export and publish again`
              : "Publish discarded: the Dropbox commit failed (after one retry). Nothing was lost — your edits are safe in the Draft. Publish again when Dropbox is reachable";
          sendEvent("error", {
            message,
            missingVideoIds: e.missingVideoIds ?? [],
          });
        },
      },
      {
        tag: "NotFoundError",
        handler: (_, sendEvent) => {
          sendEvent("error", { message: "Course not found" });
        },
      },
    ],
    fallbackMessage: "Publish failed unexpectedly",
  });
};
