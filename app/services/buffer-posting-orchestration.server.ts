import { Effect, Config } from "effect";
import { FileSystem } from "@effect/platform";
import { VideoPostOperationsService } from "@/services/db-video-post-operations.server";
import { BufferApiService } from "@/services/buffer-api-service.server";
import { VercelBlobService } from "@/services/vercel-blob-service.server";
import { selectStaleBlobs } from "@/lib/select-stale-blobs";
import type { SendEvent } from "@/lib/create-sse-response.server";

const BLOB_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Prune blobs older than 24h from the `buffer-posts/` prefix. Blob lifetime is
// now managed by this sweep rather than a per-post cleanup, so any failure here
// must never fail the post — errors are swallowed. Exported so it can be tested
// directly; the orchestration forks it off the critical path.
export const prunePendingBlobs = (blobService: VercelBlobService) =>
  blobService.list("buffer-posts/").pipe(
    Effect.flatMap((blobs) =>
      Effect.forEach(
        selectStaleBlobs(blobs, new Date(), BLOB_MAX_AGE_MS),
        (url) => blobService.del(url),
        { discard: true }
      )
    ),
    Effect.catchAll(() => Effect.void),
    Effect.ignore
  );

export const bufferPostProgram = (opts: {
  videoId: string;
  caption: string;
  sendEvent: SendEvent;
}) =>
  Effect.gen(function* () {
    const finishedDir = yield* Config.string("FINISHED_VIDEOS_DIRECTORY");
    const channelId = yield* Config.string("BUFFER_CHANNEL_ID");
    const fs = yield* FileSystem.FileSystem;
    const videoPostOps = yield* VideoPostOperationsService;
    const bufferApi = yield* BufferApiService;
    const blobService = yield* VercelBlobService;

    const filePath = `${finishedDir}/${opts.videoId}.mp4`;
    const exists = yield* fs.exists(filePath);
    if (!exists) {
      opts.sendEvent("error", {
        message: "Exported vertical video not found. Export it first.",
      });
      return;
    }

    // Kick off the stale-blob prune as a detached daemon so a slow `list`/`del`
    // never sits on the critical path of the post itself.
    yield* Effect.forkDaemon(prunePendingBlobs(blobService));

    const post = yield* videoPostOps.createVideoPost({
      videoId: opts.videoId,
      platform: "buffer",
    });

    opts.sendEvent("uploading-blob", { percentage: 0 });

    const blobPathname = `buffer-posts/${opts.videoId}.mp4`;
    const blob = yield* blobService.upload({
      pathname: blobPathname,
      filePath,
      onProgress: (percentage) => {
        opts.sendEvent("uploading-blob", { percentage });
      },
    });

    opts.sendEvent("creating-post", {});

    const bufferPost = yield* bufferApi.createPost({
      channelId,
      text: opts.caption,
      videoUrl: blob.url,
    });

    yield* videoPostOps.updateRemoteInfo({
      id: post.id,
      remoteId: bufferPost.id,
      remoteUrl: null,
    });

    // "Posted" now means "submitted to Buffer" — Buffer downloads the freshly
    // uploaded blob asynchronously (kept alive by the 24h prune), so we mark the
    // post as posted immediately and do not delete the blob here.
    yield* videoPostOps.markPosted(post.id);

    opts.sendEvent("complete", {});
  });
