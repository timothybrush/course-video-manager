import { describe, it, expect } from "@effect/vitest";
import { beforeAll, beforeEach } from "vitest";
import { Effect, Layer } from "effect";
import { VideoOperationsService } from "@/services/db-video-operations.server";
import { CourseOperationsService } from "@/services/db-course-operations.server";
import { DrizzleService } from "@/services/drizzle-service.server";
import {
  createTestDb,
  truncateAllTables,
  type TestDb,
} from "@/test-utils/pglite";

let testDb: TestDb;
let testLayer: Layer.Layer<VideoOperationsService>;

beforeAll(async () => {
  const result = await createTestDb();
  testDb = result.testDb;

  const drizzleLayer = Layer.succeed(DrizzleService, testDb as any);
  testLayer = VideoOperationsService.Default.pipe(
    Layer.provide(
      CourseOperationsService.Default.pipe(Layer.provide(drizzleLayer))
    ),
    Layer.provide(drizzleLayer)
  );
});

beforeEach(async () => {
  await truncateAllTables(testDb);
});

describe("record tile → AI name/describe flow", () => {
  it.effect(
    "creates a format:short standalone video with a placeholder title",
    () =>
      Effect.gen(function* () {
        const videoOps = yield* VideoOperationsService;

        const video = yield* videoOps.createStandaloneVideo({
          title: "Short 7/14/2026",
          format: "short",
        });

        expect(video.format).toBe("short");
        expect(video.lessonId).toBeNull();
        expect(video.title).toBe("Short 7/14/2026");
      }).pipe(Effect.provide(testLayer))
  );

  it.effect("updates title via updateVideoTitle after AI naming", () =>
    Effect.gen(function* () {
      const videoOps = yield* VideoOperationsService;

      const video = yield* videoOps.createStandaloneVideo({
        title: "Short 7/14/2026",
        format: "short",
      });

      yield* videoOps.updateVideoTitle({
        videoId: video.id,
        title: "Type narrowing with discriminated unions",
      });

      const updated = yield* videoOps.getVideoWithClipsById(video.id);
      expect(updated.title).toBe("Type narrowing with discriminated unions");
    }).pipe(Effect.provide(testLayer))
  );

  it.effect(
    "updates description via updateVideoDescription after AI naming",
    () =>
      Effect.gen(function* () {
        const videoOps = yield* VideoOperationsService;

        const video = yield* videoOps.createStandaloneVideo({
          title: "Short 7/14/2026",
          format: "short",
        });

        yield* videoOps.updateVideoDescription({
          videoId: video.id,
          description:
            "Explains how discriminated unions enable safe type narrowing in TypeScript.",
        });

        const updated = yield* videoOps.getVideoWithClipsById(video.id);
        expect(updated.description).toBe(
          "Explains how discriminated unions enable safe type narrowing in TypeScript."
        );
      }).pipe(Effect.provide(testLayer))
  );

  it.effect("new short appears in TikToks grid query", () =>
    Effect.gen(function* () {
      const videoOps = yield* VideoOperationsService;

      yield* videoOps.createStandaloneVideo({
        title: "Standard video",
      });
      yield* videoOps.createStandaloneVideo({
        title: "My short",
        format: "short",
      });

      const shorts = yield* videoOps.getAllStandaloneVideos({
        format: "short",
      });

      expect(shorts).toHaveLength(1);
      expect(shorts[0]!.title).toBe("My short");
      expect(shorts[0]!.format).toBe("short");
    }).pipe(Effect.provide(testLayer))
  );
});
