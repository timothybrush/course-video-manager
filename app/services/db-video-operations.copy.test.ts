import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  createTestDb,
  truncateAllTables,
  type TestDb,
} from "@/test-utils/pglite";
import * as schema from "@/db/schema";
import { copyVideoImpl } from "@/services/db-video-operations.copy.server";
import type { Database } from "@/services/drizzle-service.server";
import { Effect } from "effect";

let testDb: TestDb;

beforeAll(async () => {
  const result = await createTestDb();
  testDb = result.testDb;
});

beforeEach(async () => {
  await truncateAllTables(testDb);
});

async function createVideo(
  overrides: Partial<typeof schema.videos.$inferInsert> = {}
) {
  const [video] = await testDb
    .insert(schema.videos)
    .values({
      title: "problem",
      originalFootagePath: "/tmp/problem.mp4",
      ...overrides,
    })
    .returning();
  return video!;
}

async function getVideo(id: string) {
  return testDb.query.videos.findFirst({
    where: (v, { eq }) => eq(v.id, id),
  });
}

const db = () => testDb as unknown as Database;

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

describe("copyVideoImpl — renameOld", () => {
  it("renames the source video to '<title> (old)' without archiving it", async () => {
    const source = await createVideo({ title: "problem" });

    const newVideoId = await run(
      copyVideoImpl(db(), {
        sourceVideoId: source.id,
        newTitle: "problem",
        copyClips: false,
        copyBeats: false,
        renameOld: true,
      })
    );

    const oldVideo = await getVideo(source.id);
    expect(oldVideo!.title).toBe("problem (old)");
    expect(oldVideo!.archived).toBe(false);

    const newVideo = await getVideo(newVideoId);
    expect(newVideo!.title).toBe("problem");
    expect(newVideo!.archived).toBe(false);
  });

  it("appends (old) suffix even when source already has it", async () => {
    const source = await createVideo({
      title: "problem (old)",
    });

    const newVideoId = await run(
      copyVideoImpl(db(), {
        sourceVideoId: source.id,
        newTitle: "problem",
        copyClips: false,
        copyBeats: false,
        renameOld: true,
      })
    );

    const oldVideo = await getVideo(source.id);
    expect(oldVideo!.title).toBe("problem (old) (old)");

    const newVideo = await getVideo(newVideoId);
    expect(newVideo!.title).toBe("problem");
  });

  it("does not rename the source when renameOld is false", async () => {
    const source = await createVideo({ title: "problem" });

    await run(
      copyVideoImpl(db(), {
        sourceVideoId: source.id,
        newTitle: "problem (copy)",
        copyClips: false,
        copyBeats: false,
        renameOld: false,
      })
    );

    const oldVideo = await getVideo(source.id);
    expect(oldVideo!.title).toBe("problem");
  });
});
