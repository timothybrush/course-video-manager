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

describe("copyVideoImpl — archiveOld", () => {
  it("renames the source video to '<title> (old)' and archives it", async () => {
    const source = await createVideo({ title: "problem" });

    const newVideoId = await run(
      copyVideoImpl(db(), {
        sourceVideoId: source.id,
        newTitle: "problem",
        copyClips: false,
        copyBeats: false,
        archiveOld: true,
      })
    );

    const oldVideo = await getVideo(source.id);
    expect(oldVideo!.title).toBe("problem (old)");
    expect(oldVideo!.archived).toBe(true);

    const newVideo = await getVideo(newVideoId);
    expect(newVideo!.title).toBe("problem");
    expect(newVideo!.archived).toBe(false);
  });

  it("archives an already-archived source without double-suffixing the title", async () => {
    const source = await createVideo({
      title: "problem (old)",
      archived: true,
    });

    const newVideoId = await run(
      copyVideoImpl(db(), {
        sourceVideoId: source.id,
        newTitle: "problem",
        copyClips: false,
        copyBeats: false,
        archiveOld: true,
      })
    );

    const oldVideo = await getVideo(source.id);
    expect(oldVideo!.title).toBe("problem (old) (old)");
    expect(oldVideo!.archived).toBe(true);

    const newVideo = await getVideo(newVideoId);
    expect(newVideo!.title).toBe("problem");
  });

  it("does not rename or archive the source when archiveOld is false", async () => {
    const source = await createVideo({ title: "problem" });

    await run(
      copyVideoImpl(db(), {
        sourceVideoId: source.id,
        newTitle: "problem (copy)",
        copyClips: false,
        copyBeats: false,
        archiveOld: false,
      })
    );

    const oldVideo = await getVideo(source.id);
    expect(oldVideo!.title).toBe("problem");
    expect(oldVideo!.archived).toBe(false);
  });
});
