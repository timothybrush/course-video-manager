import { Effect, Schema } from "effect";
import { VideoOperationsService } from "@/services/db-video-operations.server";
import { makeAction } from "@/services/route-action.server";
import { data } from "react-router";

const createVideoSchema = Schema.Struct({
  title: Schema.String,
  format: Schema.optional(
    Schema.Union(Schema.Literal("standard"), Schema.Literal("short"))
  ),
});

export const action = makeAction({
  input: "formData",
  effect: ({ payload }) =>
    Effect.gen(function* () {
      const result = yield* Schema.decodeUnknown(createVideoSchema)(payload);

      const videoOps = yield* VideoOperationsService;

      const video = yield* videoOps.createStandaloneVideo({
        title: result.title,
        ...(result.format ? { format: result.format } : {}),
      });

      return data({ id: video.id });
    }),
});
