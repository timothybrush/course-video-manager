import { describe, it, expect } from "@effect/vitest";
import { beforeAll, beforeEach, vi } from "vitest";
import { Effect, Layer, ConfigProvider } from "effect";
import { FileSystem } from "@effect/platform";
import { VideoPostOperationsService } from "@/services/db-video-post-operations.server";
import { BufferApiService } from "@/services/buffer-api-service.server";
import { VercelBlobService } from "@/services/vercel-blob-service.server";
import {
  bufferPostProgram,
  prunePendingBlobs,
} from "@/services/buffer-posting-orchestration.server";
import { DrizzleService } from "@/services/drizzle-service.server";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  truncateAllTables,
  type TestDb,
} from "@/test-utils/pglite";

let testDb: TestDb;

beforeAll(async () => {
  const result = await createTestDb();
  testDb = result.testDb;
});

beforeEach(async () => {
  await truncateAllTables(testDb);
});

async function createTestVideo(title = "Test Short") {
  const [video] = await testDb
    .insert(schema.videos)
    .values({
      title,
      originalFootagePath: "",
      format: "short",
    })
    .returning();
  return video!;
}

function makeFakeBlobService(opts?: {
  delShouldFail?: boolean;
  listShouldFail?: boolean;
  listResult?: Array<{ url: string; pathname: string; uploadedAt: Date }>;
}) {
  return {
    upload: vi.fn(
      (_opts: {
        pathname: string;
        filePath: string;
        onProgress?: (p: number) => void;
      }) =>
        Effect.sync(() => {
          _opts.onProgress?.(0);
          _opts.onProgress?.(100);
          return {
            url: "https://blob.vercel-storage.com/buffer-posts/test.mp4",
          };
        })
    ),
    list: vi.fn((_prefix: string) =>
      opts?.listShouldFail
        ? Effect.fail({
            _tag: "VercelBlobError" as const,
            message: "list failed",
          })
        : Effect.succeed(opts?.listResult ?? [])
    ),
    del: vi.fn((_url: string) =>
      opts?.delShouldFail
        ? Effect.fail({
            _tag: "VercelBlobError" as const,
            message: "delete failed",
          })
        : Effect.void
    ),
  };
}

function makeFakeBufferApi(opts?: { createPostId?: string }) {
  return {
    createPost: vi.fn(
      (_opts: { channelId: string; text: string; videoUrl: string }) =>
        Effect.succeed({ id: opts?.createPostId ?? "buffer-post-123" })
    ),
  };
}

function makeFakeFileSystem(opts?: { fileExists?: boolean }) {
  return FileSystem.FileSystem.of({
    exists: (_path: string) => Effect.succeed(opts?.fileExists ?? true),
  } as any);
}

function makeTestLayer(fakes: {
  blobService: ReturnType<typeof makeFakeBlobService>;
  bufferApi: ReturnType<typeof makeFakeBufferApi>;
  fileExists?: boolean;
}) {
  const videoPostLayer = VideoPostOperationsService.Default.pipe(
    Layer.provide(Layer.succeed(DrizzleService, testDb as any))
  );

  const configLayer = Layer.setConfigProvider(
    ConfigProvider.fromMap(
      new Map([
        ["FINISHED_VIDEOS_DIRECTORY", "/tmp/finished-videos"],
        ["BUFFER_CHANNEL_ID", "channel-abc"],
      ])
    )
  );

  const fsLayer = Layer.succeed(
    FileSystem.FileSystem,
    makeFakeFileSystem({ fileExists: fakes.fileExists })
  );

  const blobLayer = Layer.succeed(
    VercelBlobService,
    fakes.blobService as unknown as VercelBlobService
  );

  const bufferApiLayer = Layer.succeed(
    BufferApiService,
    fakes.bufferApi as unknown as BufferApiService
  );

  return Layer.mergeAll(
    videoPostLayer,
    configLayer,
    fsLayer,
    blobLayer,
    bufferApiLayer
  );
}

function makeSendEvent() {
  const events: Array<{ event: string; data: unknown }> = [];
  const sendEvent = (event: string, data: unknown) => {
    events.push({ event, data });
  };
  return { sendEvent, events };
}

describe("bufferPostProgram", () => {
  describe("happy path — submitted to Buffer", () => {
    it.effect(
      "uploads blob, creates post, marks posted immediately, keeps blob",
      () =>
        Effect.gen(function* () {
          const video = yield* Effect.promise(() => createTestVideo());
          const blobService = makeFakeBlobService();
          const bufferApi = makeFakeBufferApi();
          const { sendEvent, events } = makeSendEvent();

          const layer = makeTestLayer({ blobService, bufferApi });

          yield* bufferPostProgram({
            videoId: video.id,
            caption: "Check this out! #coding",
            sendEvent,
          }).pipe(Effect.provide(layer));

          expect(blobService.upload).toHaveBeenCalledOnce();
          expect(blobService.upload.mock.calls[0]![0]).toMatchObject({
            pathname: `buffer-posts/${video.id}.mp4`,
          });

          expect(bufferApi.createPost).toHaveBeenCalledWith({
            channelId: "channel-abc",
            text: "Check this out! #coding",
            videoUrl: "https://blob.vercel-storage.com/buffer-posts/test.mp4",
          });

          // The freshly-uploaded blob is NOT deleted (no stale blobs listed).
          // The prune itself runs on a detached daemon fiber and is covered
          // directly by the `prunePendingBlobs` tests below.
          expect(blobService.del).not.toHaveBeenCalled();

          const posts = yield* Effect.promise(() =>
            testDb.query.videoPosts.findMany({
              where: eq(schema.videoPosts.videoId, video.id),
            })
          );
          expect(posts).toHaveLength(1);
          expect(posts[0]!.platform).toBe("buffer");
          expect(posts[0]!.remoteId).toBe("buffer-post-123");
          expect(posts[0]!.postedAt).toBeInstanceOf(Date);

          const eventTypes = events.map((e) => e.event);
          expect(eventTypes).toContain("uploading-blob");
          expect(eventTypes).toContain("creating-post");
          expect(eventTypes).toContain("complete");
          expect(eventTypes).not.toContain("polling");
          expect(eventTypes).not.toContain("cleaning-up");
          expect(eventTypes).not.toContain("error");
        })
    );
  });

  describe("prunePendingBlobs", () => {
    it.effect("deletes stale blobs but not recent ones", () =>
      Effect.gen(function* () {
        const staleUrl = "https://blob.vercel-storage.com/buffer-posts/old.mp4";
        const freshUrl =
          "https://blob.vercel-storage.com/buffer-posts/recent.mp4";
        const blobService = makeFakeBlobService({
          listResult: [
            {
              url: staleUrl,
              pathname: "buffer-posts/old.mp4",
              // 48h old — past the 24h cutoff
              uploadedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
            },
            {
              url: freshUrl,
              pathname: "buffer-posts/recent.mp4",
              // 1h old — well within the cutoff
              uploadedAt: new Date(Date.now() - 60 * 60 * 1000),
            },
          ],
        });

        yield* prunePendingBlobs(blobService as unknown as VercelBlobService);

        expect(blobService.list).toHaveBeenCalledWith("buffer-posts/");
        expect(blobService.del).toHaveBeenCalledWith(staleUrl);
        expect(blobService.del).toHaveBeenCalledOnce();
      })
    );

    it.effect("a list failure is swallowed and does not throw", () =>
      Effect.gen(function* () {
        const blobService = makeFakeBlobService({ listShouldFail: true });

        // Should complete without failing.
        yield* prunePendingBlobs(blobService as unknown as VercelBlobService);

        expect(blobService.del).not.toHaveBeenCalled();
      })
    );

    it.effect("a prune (list) failure does not fail the post", () =>
      Effect.gen(function* () {
        const video = yield* Effect.promise(() => createTestVideo());
        const blobService = makeFakeBlobService({ listShouldFail: true });
        const bufferApi = makeFakeBufferApi();
        const { sendEvent, events } = makeSendEvent();

        const layer = makeTestLayer({ blobService, bufferApi });

        yield* bufferPostProgram({
          videoId: video.id,
          caption: "Prune failure test",
          sendEvent,
        }).pipe(Effect.provide(layer));

        expect(bufferApi.createPost).toHaveBeenCalledOnce();

        const posts = yield* Effect.promise(() =>
          testDb.query.videoPosts.findMany({
            where: eq(schema.videoPosts.videoId, video.id),
          })
        );
        expect(posts).toHaveLength(1);
        expect(posts[0]!.postedAt).toBeInstanceOf(Date);

        const eventTypes = events.map((e) => e.event);
        expect(eventTypes).toContain("complete");
        expect(eventTypes).not.toContain("error");
      })
    );
  });

  describe("createPost fails", () => {
    it.effect("does not mark posted", () =>
      Effect.gen(function* () {
        const video = yield* Effect.promise(() => createTestVideo());
        const blobService = makeFakeBlobService();
        const bufferApi = makeFakeBufferApi();
        bufferApi.createPost.mockImplementation(
          () =>
            Effect.fail({
              _tag: "BufferApiError" as const,
              message: "createPost failed",
            }) as any
        );
        const { sendEvent } = makeSendEvent();

        const layer = makeTestLayer({ blobService, bufferApi });

        const exit = yield* bufferPostProgram({
          videoId: video.id,
          caption: "Fail test",
          sendEvent,
        }).pipe(Effect.provide(layer), Effect.exit);

        expect(exit._tag).toBe("Failure");

        const posts = yield* Effect.promise(() =>
          testDb.query.videoPosts.findMany({
            where: eq(schema.videoPosts.videoId, video.id),
          })
        );
        expect(posts).toHaveLength(1);
        expect(posts[0]!.postedAt).toBeNull();
      })
    );
  });

  describe("file does not exist", () => {
    it.effect("sends error and does not upload", () =>
      Effect.gen(function* () {
        const video = yield* Effect.promise(() => createTestVideo());
        const blobService = makeFakeBlobService();
        const bufferApi = makeFakeBufferApi();
        const { sendEvent, events } = makeSendEvent();

        const layer = makeTestLayer({
          blobService,
          bufferApi,
          fileExists: false,
        });

        yield* bufferPostProgram({
          videoId: video.id,
          caption: "No file",
          sendEvent,
        }).pipe(Effect.provide(layer));

        expect(blobService.upload).not.toHaveBeenCalled();
        expect(bufferApi.createPost).not.toHaveBeenCalled();

        const errorEvents = events.filter((e) => e.event === "error");
        expect(errorEvents).toHaveLength(1);
        expect((errorEvents[0]!.data as any).message).toContain("not found");
      })
    );
  });

  describe("videoPosts row lifecycle", () => {
    it.effect(
      "creates row before upload and sets remoteId after createPost",
      () =>
        Effect.gen(function* () {
          const video = yield* Effect.promise(() => createTestVideo());
          const blobService = makeFakeBlobService();
          const bufferApi = makeFakeBufferApi({ createPostId: "bp-custom-id" });
          const { sendEvent } = makeSendEvent();

          const layer = makeTestLayer({ blobService, bufferApi });

          yield* bufferPostProgram({
            videoId: video.id,
            caption: "Lifecycle test",
            sendEvent,
          }).pipe(Effect.provide(layer));

          const posts = yield* Effect.promise(() =>
            testDb.query.videoPosts.findMany({
              where: eq(schema.videoPosts.videoId, video.id),
            })
          );
          expect(posts[0]!.remoteId).toBe("bp-custom-id");
          expect(posts[0]!.remoteUrl).toBeNull();
          expect(posts[0]!.postedAt).toBeInstanceOf(Date);
        })
    );
  });
});
