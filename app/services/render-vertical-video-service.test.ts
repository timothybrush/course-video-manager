import { describe, it, expect } from "@effect/vitest";
import { beforeAll, beforeEach } from "vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import { NodeContext } from "@effect/platform-node";
import { VideoOperationsService } from "@/services/db-video-operations.server";
import { VideoProcessingService } from "@/services/video-processing-service";
import { FFmpegCommandsService } from "@/services/ffmpeg-commands";
import { DrizzleService } from "@/services/drizzle-service.server";
import { ClipOperationsService } from "@/services/db-clip-operations.server";
import * as schema from "@/db/schema";
import {
  createTestDb,
  truncateAllTables,
  type TestDb,
} from "@/test-utils/pglite";
import {
  buildSubtitles,
  RenderVerticalVideoService,
} from "./render-vertical-video-service";

describe("buildSubtitles", () => {
  it("converts word timings to frame-based subtitles with clip offsets", () => {
    const clips = [
      { sourceStartTime: 10, sourceEndTime: 13 },
      { sourceStartTime: 20, sourceEndTime: 22 },
    ];
    const transcriptions = [
      {
        id: "clip-1",
        words: [
          { start: 0, end: 0.5, text: "Hello" },
          { start: 0.6, end: 1.0, text: "world" },
        ],
      },
      {
        id: "clip-2",
        words: [{ start: 0, end: 0.8, text: "Test" }],
      },
    ];
    const fps = 60;

    const result = buildSubtitles(clips, transcriptions, fps);

    expect(result).toEqual([
      { startFrame: 0, endFrame: 30, text: "Hello" },
      { startFrame: 36, endFrame: 60, text: "world" },
      // Clip 2 starts at offset 3s (clip 1 duration = 13-10 = 3s)
      { startFrame: 180, endFrame: 228, text: "Test" },
    ]);
  });

  it("handles empty transcriptions for a clip", () => {
    const clips = [
      { sourceStartTime: 0, sourceEndTime: 2 },
      { sourceStartTime: 5, sourceEndTime: 7 },
    ];
    const transcriptions = [
      {
        id: "clip-1",
        words: [] as { start: number; end: number; text: string }[],
      },
      {
        id: "clip-2",
        words: [{ start: 0.5, end: 1.0, text: "Late" }],
      },
    ];
    const fps = 30;

    const result = buildSubtitles(clips, transcriptions, fps);

    // Clip 1 has no words, clip 2 starts at offset 2s
    expect(result).toEqual([{ startFrame: 75, endFrame: 90, text: "Late" }]);
  });

  it("returns empty array when no words in any clip", () => {
    const clips = [{ sourceStartTime: 0, sourceEndTime: 5 }];
    const transcriptions = [
      {
        id: "clip-1",
        words: [] as { start: number; end: number; text: string }[],
      },
    ];

    const result = buildSubtitles(clips, transcriptions, 60);

    expect(result).toEqual([]);
  });
});

describe("RenderVerticalVideoService", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    const result = await createTestDb();
    testDb = result.testDb;
  });

  beforeEach(async () => {
    await truncateAllTables(testDb);
  });

  function buildTestLayer(overrides?: {
    exportResult?: string;
    transcribeResult?: (clips: unknown[]) => unknown[];
    getFpsResult?: number;
  }) {
    const dbLayer = Layer.succeed(DrizzleService, testDb as any);

    const fakeVideoProcessing = Layer.succeed(VideoProcessingService, {
      transcribeClips: (clips: any) => {
        if (overrides?.transcribeResult) {
          return Effect.succeed(overrides.transcribeResult(clips));
        }
        return Effect.succeed(
          clips.map((c: any) => ({
            id: c.id,
            words: [
              { start: 0, end: 0.5, text: "hello" },
              { start: 0.6, end: 1.0, text: "world" },
            ],
            segments: [{ start: 0, end: 1.0, text: "hello world" }],
          }))
        );
      },
      exportVideoClips: () =>
        Effect.succeed(overrides?.exportResult ?? "/tmp/fake-concatenated.mp4"),
    } as any);

    const fakeFfmpeg = Layer.succeed(FFmpegCommandsService, {
      getFPS: () => Effect.succeed(overrides?.getFpsResult ?? 60),
    } as any);

    const configLayer = Layer.setConfigProvider(
      ConfigProvider.fromMap(
        new Map([
          ["FINISHED_VIDEOS_DIRECTORY", "/tmp/test-finished-videos"],
          ["OPENAI_API_KEY", "test-key"],
        ])
      )
    );

    const depsLayer = Layer.mergeAll(
      VideoOperationsService.Default.pipe(Layer.provide(dbLayer)),
      ClipOperationsService.Default.pipe(Layer.provide(dbLayer)),
      fakeVideoProcessing,
      fakeFfmpeg,
      configLayer,
      NodeContext.layer
    );

    return Layer.merge(
      depsLayer,
      RenderVerticalVideoService.Default.pipe(Layer.provide(depsLayer))
    );
  }

  it.effect("rejects when video has no clips", () =>
    Effect.gen(function* () {
      const [video] = yield* Effect.promise(() =>
        testDb
          .insert(schema.videos)
          .values({
            title: "Empty Short",
            originalFootagePath: "/footage/empty.mp4",
            format: "short",
          })
          .returning()
      );

      const service = yield* RenderVerticalVideoService;
      const result = yield* service
        .renderVerticalVideo({ videoId: video!.id })
        .pipe(Effect.flip);

      expect(result._tag).toBe("RenderVerticalError");
    }).pipe(Effect.provide(buildTestLayer()))
  );

  it.effect("rejects when video does not exist", () =>
    Effect.gen(function* () {
      const service = yield* RenderVerticalVideoService;
      const result = yield* service
        .renderVerticalVideo({ videoId: "nonexistent-id" })
        .pipe(Effect.flip);

      expect(result._tag).toBe("NotFoundError");
    }).pipe(Effect.provide(buildTestLayer()))
  );
});
