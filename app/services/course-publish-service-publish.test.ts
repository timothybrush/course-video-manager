import { describe, it, expect, beforeAll } from "vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import { NodeContext } from "@effect/platform-node";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  createTestDb,
  truncateAllTables,
  type TestDb,
} from "@/test-utils/pglite";
import { CourseOperationsService } from "@/services/db-course-operations.server";
import { VideoOperationsService } from "@/services/db-video-operations.server";
import { VersionOperationsService } from "@/services/db-version-operations.server";
import { LessonSectionOperationsService } from "@/services/db-lesson-section-operations.server";
import { DrizzleService } from "@/services/drizzle-service.server";
import { VideoProcessingService } from "@/services/video-processing-service";
import { CoursePublishService } from "@/services/course-publish-service";
import { computeExportHash, type ExportClip } from "@/services/export-hash";
import {
  clips as clipsTable,
  chapters as chaptersTable,
  videos as videosTable,
} from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: TestDb;
let finishedVideosDir: string;

beforeAll(async () => {
  const result = await createTestDb();
  testDb = result.testDb;
});

const setup = async (opts?: {
  mockVideoProcessing?: Layer.Layer<VideoProcessingService>;
}) => {
  await truncateAllTables(testDb);

  finishedVideosDir = fs.mkdtempSync(
    path.join(tmpdir(), "publish-test-videos-")
  );

  const drizzleLayer = Layer.succeed(DrizzleService, testDb as any);
  const dbLayer = Layer.mergeAll(
    CourseOperationsService.Default,
    VideoOperationsService.Default,
    VersionOperationsService.Default,
    LessonSectionOperationsService.Default
  ).pipe(Layer.provide(drizzleLayer));

  const course = await Effect.gen(function* () {
    const courseOps = yield* CourseOperationsService;
    return yield* courseOps.createCourse({ name: "test-course" });
  }).pipe(Effect.provide(dbLayer), Effect.runPromise);

  const version = await Effect.gen(function* () {
    const versionOps = yield* VersionOperationsService;
    return yield* versionOps.createCourseVersion({
      repoId: course.id,
      name: "v1",
    });
  }).pipe(Effect.provide(dbLayer), Effect.runPromise);

  const section = await Effect.gen(function* () {
    const lsOps = yield* LessonSectionOperationsService;
    const sections = yield* lsOps.createSections({
      repoVersionId: version.id,
      sections: [{ sectionPathWithNumber: "01-intro", sectionNumber: 1 }],
    });
    return sections[0]!;
  }).pipe(Effect.provide(dbLayer), Effect.runPromise);

  const lesson = await Effect.gen(function* () {
    const lsOps = yield* LessonSectionOperationsService;
    const lessons = yield* lsOps.createLessons(section.id, [
      { lessonPathWithNumber: "01.01-welcome", lessonNumber: 1 },
    ]);
    return lessons[0]!;
  }).pipe(Effect.provide(dbLayer), Effect.runPromise);

  const video = await Effect.gen(function* () {
    const videoOps = yield* VideoOperationsService;
    return yield* videoOps.createVideo(lesson.id, {
      title: "Problem",
      originalFootagePath: "/tmp/footage.mp4",
    });
  }).pipe(Effect.provide(dbLayer), Effect.runPromise);

  await testDb.insert(clipsTable).values([
    {
      videoId: video.id,
      videoFilename: "recording.mp4",
      sourceStartTime: 0,
      sourceEndTime: 10,
      order: "a0",
      text: "Hello world",
      pauseType: "none",
    },
    {
      videoId: video.id,
      videoFilename: "recording.mp4",
      sourceStartTime: 15,
      sourceEndTime: 25,
      order: "a1",
      text: "Welcome to the course",
      pauseType: "none",
    },
  ]);

  // Add chapter and body/description so publish doesn't fail on lints
  await testDb.insert(chaptersTable).values({
    videoId: video.id,
    name: "Introduction",
    order: "a",
  });
  await testDb
    .update(videosTable)
    .set({ body: "Lesson body content", description: "SEO description" })
    .where(eq(videosTable.id, video.id));

  const clips: ExportClip[] = [
    { videoFilename: "recording.mp4", sourceStartTime: 0, sourceEndTime: 10 },
    { videoFilename: "recording.mp4", sourceStartTime: 15, sourceEndTime: 25 },
  ];
  const exportHash = computeExportHash(clips, "landscape")!;

  const dropboxDir = fs.mkdtempSync(
    path.join(tmpdir(), "publish-test-dropbox-")
  );

  const defaultMockVideoProcessing = Layer.succeed(VideoProcessingService, {
    exportVideoClips: (exportOpts: any) =>
      Effect.sync(() => {
        const outputPath = path.join(
          finishedVideosDir,
          `${exportOpts.videoId}.mp4`
        );
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, "dummy-video-content");
        exportOpts.onStageChange?.("concatenating-clips");
        exportOpts.onStageChange?.("normalizing-audio");
        return outputPath;
      }),
  } as any);
  const mockVideoProcessing =
    opts?.mockVideoProcessing ?? defaultMockVideoProcessing;

  const configLayer = Layer.setConfigProvider(
    ConfigProvider.fromMap(
      new Map([
        ["FINISHED_VIDEOS_DIRECTORY", finishedVideosDir],
        ["DROPBOX_PATH", dropboxDir],
      ])
    )
  );

  const coreTestLayer = Layer.mergeAll(
    CourseOperationsService.Default,
    VideoOperationsService.Default,
    VersionOperationsService.Default,
    mockVideoProcessing,
    NodeContext.layer
  ).pipe(Layer.provide(drizzleLayer), Layer.provide(configLayer));

  const testLayer = Layer.merge(
    coreTestLayer,
    CoursePublishService.Default.pipe(Layer.provide(coreTestLayer))
  );

  const run = <A, E>(effect: Effect.Effect<A, E, any>) =>
    Effect.runPromise(
      effect.pipe(Effect.provide(testLayer) as any)
    ) as Promise<A>;

  return { course, version, video, exportHash, dropboxDir, run };
};

describe("CoursePublishService — publish", () => {
  it("auto-exports unexported videos and reports the exporting stage", async () => {
    const { course, exportHash, run } = await setup();

    const stages: string[] = [];
    const result = await run(
      Effect.gen(function* () {
        const svc = yield* CoursePublishService;
        return yield* svc.publish(
          course.id,
          "v1.0",
          "First release",
          true,
          (stage) => {
            stages.push(stage);
          }
        );
      })
    );

    expect(stages).toContain("exporting");
    expect(stages).toContain("uploading");

    const expectedPath = path.join(
      finishedVideosDir,
      `${course.id}-${exportHash}.mp4`
    );
    expect(fs.existsSync(expectedPath)).toBe(true);

    expect(result).toHaveProperty("publishedVersionId");
    expect(result).toHaveProperty("newDraftVersionId");
  });

  it("skips exporting stage when all videos are already exported", async () => {
    const { course, exportHash, run } = await setup();

    fs.writeFileSync(
      path.join(finishedVideosDir, `${course.id}-${exportHash}.mp4`),
      "data"
    );

    const stages: string[] = [];
    await run(
      Effect.gen(function* () {
        const svc = yield* CoursePublishService;
        yield* svc.publish(
          course.id,
          "v1.0",
          "First release",
          true,
          (stage) => {
            stages.push(stage);
          }
        );
      })
    );

    expect(stages).not.toContain("exporting");
    expect(stages).toContain("uploading");
  });

  it("Promotes the Pending Version and leaves a fresh Draft on success", async () => {
    const { course, run } = await setup();

    const result = await run(
      Effect.gen(function* () {
        const svc = yield* CoursePublishService;
        const outcome = yield* svc.publish(
          course.id,
          "v1.0",
          "First release",
          true
        );
        const versionOps = yield* VersionOperationsService;
        const versions = yield* versionOps.getCourseVersions(course.id);
        return { outcome, versions };
      })
    );

    expect(result.versions).toHaveLength(2);
    const published = result.versions.find(
      (v) => v.id === result.outcome.publishedVersionId
    );
    const draft = result.versions.find(
      (v) => v.id === result.outcome.newDraftVersionId
    );
    expect(published).toMatchObject({
      name: "v1.0",
      commitState: "published",
    });
    expect(draft).toMatchObject({ name: "", commitState: "draft" });
  });

  it("Discards the Pending Version after one failed in-flight retry of the Commit", async () => {
    const { course, dropboxDir, run } = await setup();

    // Every Commit attempt stages into a fresh `.cvm-staging-<uuid>` dir, so
    // the number of distinct staging dirs observed = the number of attempts.
    const stagingDirsSeen = new Set<string>();
    let watcher: fs.FSWatcher | null = null;

    const result = await run(
      Effect.gen(function* () {
        const svc = yield* CoursePublishService;
        const outcome = yield* svc
          .publish(course.id, "v1.0", "First release", false, (stage) => {
            if (stage === "uploading") {
              // A directory squatting on course.json makes the atomic rename
              // (the commit receipt) fail — persistently, so the in-flight
              // retry fails too.
              const courseDir = path.join(dropboxDir, "test-course");
              fs.mkdirSync(path.join(courseDir, "course.json"), {
                recursive: true,
              });
              watcher = fs.watch(courseDir, (_event, filename) => {
                if (filename?.startsWith(".cvm-staging-")) {
                  stagingDirsSeen.add(filename);
                }
              });
            }
          })
          .pipe(
            Effect.catchTag("PublishCommitFailedError", (error) =>
              Effect.succeed({ error: true as const, errorDetails: error })
            )
          );
        const versionOps = yield* VersionOperationsService;
        const versions = yield* versionOps.getCourseVersions(course.id);
        return { outcome, versions };
      })
    );
    watcher!.close();

    expect(result.outcome).toMatchObject({
      error: true,
      errorDetails: { reason: "sync_failed" },
    });
    // One original attempt + exactly one in-flight retry (issue #1401).
    expect(stagingDirsSeen.size).toBe(2);
    // The Pending Version was auto-Discarded: only the fresh Draft remains,
    // and the submitted content lives on inside it.
    expect(result.versions).toHaveLength(1);
    expect(result.versions[0]).toMatchObject({
      id: (result.outcome as any).errorDetails.newDraftVersionId,
      name: "",
      commitState: "draft",
    });
    expect(
      result.versions.some(
        (v) => v.id === (result.outcome as any).errorDetails.discardedVersionId
      )
    ).toBe(false);
  });

  it("Discards immediately on missing assets, naming the missing videos", async () => {
    const { course, video, exportHash, run } = await setup();

    // Pre-export so validation passes, then yank the file mid-publish.
    fs.writeFileSync(
      path.join(finishedVideosDir, `${course.id}-${exportHash}.mp4`),
      "data"
    );

    const result = await run(
      Effect.gen(function* () {
        const svc = yield* CoursePublishService;
        const outcome = yield* svc
          .publish(course.id, "v1.0", "First release", true, (stage) => {
            if (stage === "uploading") {
              fs.rmSync(
                path.join(finishedVideosDir, `${course.id}-${exportHash}.mp4`)
              );
            }
          })
          .pipe(
            Effect.catchTag("PublishCommitFailedError", (error) =>
              Effect.succeed({ error: true as const, errorDetails: error })
            )
          );
        const versionOps = yield* VersionOperationsService;
        const versions = yield* versionOps.getCourseVersions(course.id);
        return { outcome, versions };
      })
    );

    expect(result.outcome).toMatchObject({
      error: true,
      errorDetails: {
        reason: "missing_assets",
        missingVideoIds: [video.id],
      },
    });
    // Discarded immediately: only the fresh Draft remains.
    expect(result.versions).toHaveLength(1);
    expect(result.versions[0]).toMatchObject({
      name: "",
      commitState: "draft",
    });
  });

  it("re-syncs the newest Published Version by commit state", async () => {
    const { course, dropboxDir, run } = await setup();

    const result = await run(
      Effect.gen(function* () {
        const svc = yield* CoursePublishService;
        const outcome = yield* svc.publish(
          course.id,
          "v1.0",
          "First release",
          false
        );
        fs.rmSync(path.join(dropboxDir, "test-course", "course.json"));
        const retry = yield* svc.syncToDropbox(course.id, false);
        const manifest = JSON.parse(
          fs.readFileSync(
            path.join(dropboxDir, "test-course", "course.json"),
            "utf-8"
          )
        );
        return { outcome, retry, manifest };
      })
    );

    expect(result.retry.missingVideos).toEqual([]);
    expect(result.manifest.courseVersionId).toBe(
      result.outcome.publishedVersionId
    );
  });

  it("fails with PublishValidationError when export fails after retries", async () => {
    const failingMock = Layer.succeed(VideoProcessingService, {
      exportVideoClips: () => Effect.fail(new Error("ffmpeg crashed")),
    } as any);
    const { course, video, run } = await setup({
      mockVideoProcessing: failingMock,
    });

    const result = await run(
      Effect.gen(function* () {
        const svc = yield* CoursePublishService;
        return yield* svc
          .publish(course.id, "v1.0", "First release", true)
          .pipe(
            Effect.catchTag("PublishValidationError", (e) =>
              Effect.succeed({
                error: true as const,
                failedExportVideoIds: e.failedExportVideoIds,
              })
            )
          );
      })
    );

    expect(result).toHaveProperty("error", true);
    expect((result as any).failedExportVideoIds).toContain(video.id);
  });

  it("emits per-video export events and upload progress during publish", async () => {
    const { course, video, run } = await setup();

    const events: Array<{ event: string; data: any }> = [];
    await run(
      Effect.gen(function* () {
        const svc = yield* CoursePublishService;
        yield* svc.publish(
          course.id,
          "v1.0",
          "First release",
          true,
          undefined,
          (event, data) => {
            events.push({ event, data });
          }
        );
      })
    );

    // The videos list (id + section/lesson/title) arrives before exporting —
    // the same payload the standalone batchExport emits.
    const videosEvent = events.find((e) => e.event === "videos");
    expect(videosEvent?.data.videos).toEqual([
      {
        id: video.id,
        title: expect.stringMatching(/\/Problem$/),
      },
    ]);

    // Per-video stages: queued, then the ffmpeg stages.
    const stages = events
      .filter((e) => e.event === "stage" && e.data.videoId === video.id)
      .map((e) => e.data.stage);
    expect(stages).toEqual([
      "queued",
      "concatenating-clips",
      "normalizing-audio",
    ]);

    expect(
      events.some((e) => e.event === "complete" && e.data.videoId === video.id)
    ).toBe(true);

    // The Commit sync's per-lesson upload percentage flows through too.
    const progressEvents = events.filter((e) => e.event === "progress");
    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents.at(-1)?.data.percentage).toBe(100);
  });

  it("emits a per-video error event and still fails with PublishValidationError", async () => {
    const failingMock = Layer.succeed(VideoProcessingService, {
      exportVideoClips: () => Effect.fail(new Error("ffmpeg crashed")),
    } as any);
    const { course, video, run } = await setup({
      mockVideoProcessing: failingMock,
    });

    const events: Array<{ event: string; data: any }> = [];
    const result = await run(
      Effect.gen(function* () {
        const svc = yield* CoursePublishService;
        return yield* svc
          .publish(
            course.id,
            "v1.0",
            "First release",
            true,
            undefined,
            (event, data) => {
              events.push({ event, data });
            }
          )
          .pipe(
            Effect.catchTag("PublishValidationError", (e) =>
              Effect.succeed({
                error: true as const,
                failedExportVideoIds: e.failedExportVideoIds,
              })
            )
          );
      })
    );

    const errorEvent = events.find((e) => e.event === "error");
    expect(errorEvent?.data.videoId).toBe(video.id);
    expect(typeof errorEvent?.data.message).toBe("string");
    // The per-video error event does not change the terminal behavior.
    expect(result).toHaveProperty("error", true);
    expect((result as any).failedExportVideoIds).toContain(video.id);
  });
});
