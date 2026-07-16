import { FileSystem } from "@effect/platform";
import { Data, Effect, Config } from "effect";

export class VercelBlobError extends Data.TaggedError("VercelBlobError")<{
  message: string;
}> {}

const createVercelBlobOperations = (token: string) => ({
  upload: (opts: {
    pathname: string;
    filePath: string;
    onProgress?: (percentage: number) => void;
  }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      const stat = yield* fs.stat(opts.filePath).pipe(
        Effect.mapError(
          () =>
            new VercelBlobError({
              message: `File not found: ${opts.filePath}`,
            })
        )
      );

      opts.onProgress?.(0);

      const fileContent = yield* fs.readFile(opts.filePath).pipe(
        Effect.mapError(
          () =>
            new VercelBlobError({
              message: `Failed to read file: ${opts.filePath}`,
            })
        )
      );

      const result = yield* Effect.tryPromise({
        try: async () => {
          const res = await fetch(
            `https://blob.vercel-storage.com/${opts.pathname}`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${token}`,
                "x-api-version": "7",
                "Content-Type": "video/mp4",
                "Content-Length": String(stat.size),
                "x-content-length": String(stat.size),
              },
              body: Buffer.from(fileContent),
            }
          );

          if (!res.ok) {
            const text = await res.text();
            throw new Error(
              `Vercel Blob upload failed (${res.status}): ${text}`
            );
          }

          return (await res.json()) as { url: string };
        },
        catch: (e) =>
          new VercelBlobError({
            message: e instanceof Error ? e.message : String(e),
          }),
      });

      opts.onProgress?.(100);
      return { url: result.url };
    }),

  list: (prefix: string) =>
    Effect.tryPromise({
      try: async () => {
        const res = await fetch(
          `https://blob.vercel-storage.com?prefix=${encodeURIComponent(
            prefix
          )}&limit=1000`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "x-api-version": "7",
            },
          }
        );

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Vercel Blob list failed (${res.status}): ${text}`);
        }

        const json = (await res.json()) as {
          blobs: Array<{
            url: string;
            pathname: string;
            size: number;
            uploadedAt: string;
          }>;
          cursor?: string;
          hasMore: boolean;
        };

        return json.blobs.map((blob) => ({
          url: blob.url,
          pathname: blob.pathname,
          uploadedAt: new Date(blob.uploadedAt),
        }));
      },
      catch: (e) =>
        new VercelBlobError({
          message: e instanceof Error ? e.message : String(e),
        }),
    }),

  del: (url: string) =>
    Effect.tryPromise({
      try: async () => {
        const res = await fetch("https://blob.vercel-storage.com/delete", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ urls: [url] }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Vercel Blob delete failed (${res.status}): ${text}`);
        }
      },
      catch: (e) =>
        new VercelBlobError({
          message: e instanceof Error ? e.message : String(e),
        }),
    }),
});

export class VercelBlobService extends Effect.Service<VercelBlobService>()(
  "VercelBlobService",
  {
    effect: Effect.gen(function* () {
      const token = yield* Config.string("BLOB_READ_WRITE_TOKEN");
      return createVercelBlobOperations(token);
    }),
    dependencies: [],
  }
) {}
