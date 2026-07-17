import { CoursePublishService } from "@/services/course-publish-service";
import { Effect, Schema } from "effect";
import { makeAction } from "@/services/route-action.server";

const publishRepoSchema = Schema.Struct({
  repoId: Schema.String,
  courseVersionId: Schema.optional(Schema.String),
  includeTodoLessons: Schema.optional(Schema.Boolean),
});

export const action = makeAction({
  input: "formData",
  dump: false,
  errors: {
    DoesNotExistOnDbError: 400,
    PublishValidationError: 400,
    NotFoundError: 404,
  },
  effect: ({ payload }) =>
    Effect.gen(function* () {
      const result = yield* Schema.decodeUnknown(publishRepoSchema)(payload);

      const publishService = yield* CoursePublishService;
      // Pending commits must retry the exact frozen Course Version with the
      // original to-do policy. Without an id, re-sync the latest frozen version.
      return result.courseVersionId
        ? yield* publishService.syncFrozenVersionToDropbox(
            result.repoId,
            result.courseVersionId,
            result.includeTodoLessons ?? true
          )
        : yield* publishService.syncToDropbox(
            result.repoId,
            result.includeTodoLessons ?? true
          );
    }),
});
