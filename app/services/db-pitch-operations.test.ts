import { describe, it, expect } from "@effect/vitest";
import { beforeAll, beforeEach } from "vitest";
import { Effect, Layer } from "effect";
import { eq } from "drizzle-orm";
import { DBFunctionsService } from "@/services/db-service.server";
import { DrizzleService } from "@/services/drizzle-service.server";
import * as schema from "@/db/schema";
import {
  createTestDb,
  truncateAllTables,
  type TestDb,
} from "@/test-utils/pglite";

let testDb: TestDb;
let testLayer: Layer.Layer<DBFunctionsService>;

beforeAll(async () => {
  const result = await createTestDb();
  testDb = result.testDb;

  testLayer = DBFunctionsService.Default.pipe(
    Layer.provide(Layer.succeed(DrizzleService, testDb as any))
  );
});

beforeEach(async () => {
  await truncateAllTables(testDb);
});

describe("createPitch", () => {
  it.effect("creates a pitch with default values", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const pitch = yield* db.createPitch();

      expect(pitch.id).toEqual(expect.any(String));
      expect(pitch.title).toBe("");
      expect(pitch.description).toBe("");
      expect(pitch.youtubeTitle).toBe("");
      expect(pitch.youtubeThumbnailDescription).toBe("");
      expect(pitch.newsletterTitle).toBe("");
      expect(pitch.tweet).toBe("");
      expect(pitch.status).toBe("idle");
      expect(pitch.priority).toBe(2);
      expect(pitch.archived).toBe(false);
      expect(pitch.createdAt).toBeInstanceOf(Date);
      expect(pitch.updatedAt).toBeInstanceOf(Date);
    }).pipe(Effect.provide(testLayer))
  );
});

describe("listPitches", () => {
  it.effect(
    "returns all non-archived pitches sorted by priority asc then createdAt desc",
    () =>
      Effect.gen(function* () {
        const db = yield* DBFunctionsService;

        const p1 = yield* db.createPitch();
        yield* db.updatePitchField(p1.id, "title", "First");

        const p2 = yield* db.createPitch();
        yield* db.updatePitchField(p2.id, "title", "Second");

        const p3 = yield* db.createPitch();
        yield* db.updatePitchField(p3.id, "title", "Archived");
        yield* db.updatePitchField(p3.id, "archived", true);

        const list = yield* db.listPitches();

        expect(list).toHaveLength(2);
        expect(list[0]!.title).toBe("Second");
        expect(list[1]!.title).toBe("First");
      }).pipe(Effect.provide(testLayer))
  );
});

describe("getPitch", () => {
  it.effect("returns a pitch by id", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const created = yield* db.createPitch();
      const fetched = yield* db.getPitch(created.id);

      expect(fetched.id).toBe(created.id);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("fails with NotFoundError for missing id", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const result = yield* db.getPitch("nonexistent-id").pipe(Effect.flip);

      expect(result._tag).toBe("NotFoundError");
    }).pipe(Effect.provide(testLayer))
  );
});

describe("updatePitchField", () => {
  it.effect("updates only the named field and bumps updatedAt", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const created = yield* db.createPitch();
      const originalUpdatedAt = created.updatedAt;

      const updated = yield* db.updatePitchField(
        created.id,
        "title",
        "New Title"
      );

      expect(updated.title).toBe("New Title");
      expect(updated.description).toBe("");
      expect(updated.status).toBe("idle");
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt.getTime()
      );
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("updates priority as a number", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const created = yield* db.createPitch();
      const updated = yield* db.updatePitchField(created.id, "priority", 1);

      expect(updated.priority).toBe(1);
    }).pipe(Effect.provide(testLayer))
  );
});

describe("listPitches", () => {
  it.effect("returns empty array when no pitches exist", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const list = yield* db.listPitches();
      expect(list).toEqual([]);
    }).pipe(Effect.provide(testLayer))
  );
});

describe("updatePitchField", () => {
  it.effect("fails with NotFoundError for non-existent pitch", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const result = yield* db
        .updatePitchField("nonexistent-id", "title", "Nope")
        .pipe(Effect.flip);
      expect(result._tag).toBe("NotFoundError");
    }).pipe(Effect.provide(testLayer))
  );
});

describe("listPitches with filters", () => {
  it.effect("filters by status", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;

      const p1 = yield* db.createPitch();
      yield* db.updatePitchField(p1.id, "title", "Idle one");

      const p2 = yield* db.createPitch();
      yield* db.updatePitchField(p2.id, "title", "Scheduled one");
      yield* db.updatePitchField(p2.id, "status", "scheduled");

      const p3 = yield* db.createPitch();
      yield* db.updatePitchField(p3.id, "title", "Cancelled one");
      yield* db.updatePitchField(p3.id, "status", "cancelled");

      const idleOnly = yield* db.listPitches({ status: ["idle"] });
      expect(idleOnly).toHaveLength(1);
      expect(idleOnly[0]!.title).toBe("Idle one");

      const multiStatus = yield* db.listPitches({
        status: ["idle", "scheduled"],
      });
      expect(multiStatus).toHaveLength(2);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("filters by priority", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;

      const p1 = yield* db.createPitch();
      yield* db.updatePitchField(p1.id, "priority", 1);

      const p2 = yield* db.createPitch();
      yield* db.updatePitchField(p2.id, "priority", 2);

      const p3 = yield* db.createPitch();
      yield* db.updatePitchField(p3.id, "priority", 3);

      const highOnly = yield* db.listPitches({ priority: [1] });
      expect(highOnly).toHaveLength(1);

      const highAndMed = yield* db.listPitches({ priority: [1, 2] });
      expect(highAndMed).toHaveLength(2);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("filters by archived flag", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;

      yield* db.createPitch();
      const p2 = yield* db.createPitch();
      yield* db.updatePitchField(p2.id, "archived", true);

      const nonArchived = yield* db.listPitches({ archived: false });
      expect(nonArchived).toHaveLength(1);

      const archivedOnly = yield* db.listPitches({ archived: true });
      expect(archivedOnly).toHaveLength(1);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("sorts by priority asc then createdAt desc", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;

      const p1 = yield* db.createPitch();
      yield* db.updatePitchField(p1.id, "title", "P2 older");
      yield* db.updatePitchField(p1.id, "priority", 2);

      const p2 = yield* db.createPitch();
      yield* db.updatePitchField(p2.id, "title", "P1");
      yield* db.updatePitchField(p2.id, "priority", 1);

      const p3 = yield* db.createPitch();
      yield* db.updatePitchField(p3.id, "title", "P2 newer");
      yield* db.updatePitchField(p3.id, "priority", 2);

      const list = yield* db.listPitches();
      expect(list[0]!.title).toBe("P1");
      expect(list[1]!.title).toBe("P2 newer");
      expect(list[2]!.title).toBe("P2 older");
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("combines status and priority filters", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;

      const p1 = yield* db.createPitch();
      yield* db.updatePitchField(p1.id, "priority", 1);

      const p2 = yield* db.createPitch();
      yield* db.updatePitchField(p2.id, "priority", 2);
      yield* db.updatePitchField(p2.id, "status", "scheduled");

      const p3 = yield* db.createPitch();
      yield* db.updatePitchField(p3.id, "priority", 1);
      yield* db.updatePitchField(p3.id, "status", "scheduled");

      const result = yield* db.listPitches({
        status: ["scheduled"],
        priority: [1],
      });
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(p3.id);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect(
    "returns all non-archived when called with no filters (backward compat)",
    () =>
      Effect.gen(function* () {
        const db = yield* DBFunctionsService;

        yield* db.createPitch();
        yield* db.createPitch();
        const p3 = yield* db.createPitch();
        yield* db.updatePitchField(p3.id, "archived", true);

        const list = yield* db.listPitches();
        expect(list).toHaveLength(2);
      }).pipe(Effect.provide(testLayer))
  );

  it.effect("treats empty status array as no status filter", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;

      yield* db.createPitch();
      const p2 = yield* db.createPitch();
      yield* db.updatePitchField(p2.id, "status", "scheduled");

      const list = yield* db.listPitches({ status: [] });
      expect(list).toHaveLength(2);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("treats empty priority array as no priority filter", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;

      const p1 = yield* db.createPitch();
      yield* db.updatePitchField(p1.id, "priority", 1);
      const p2 = yield* db.createPitch();
      yield* db.updatePitchField(p2.id, "priority", 3);

      const list = yield* db.listPitches({ priority: [] });
      expect(list).toHaveLength(2);
    }).pipe(Effect.provide(testLayer))
  );
});

describe("deletePitch", () => {
  it.effect("removes the pitch row", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const created = yield* db.createPitch();
      yield* db.deletePitch(created.id);

      const result = yield* db.getPitch(created.id).pipe(Effect.flip);
      expect(result._tag).toBe("NotFoundError");
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("does not error when deleting a non-existent pitch", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      yield* db.deletePitch("nonexistent-id");
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("sets pitchId to NULL on linked videos", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const pitch = yield* db.createPitch();
      const video = yield* db.createStandaloneVideo({ path: "test-vid" });

      yield* Effect.promise(() =>
        testDb
          .update(schema.videos)
          .set({ pitchId: pitch.id })
          .where(eq(schema.videos.id, video.id))
      );

      yield* db.deletePitch(pitch.id);

      const updatedVideo = yield* Effect.promise(() =>
        testDb.query.videos.findFirst({
          where: eq(schema.videos.id, video.id),
        })
      );
      expect(updatedVideo!.pitchId).toBeNull();
    }).pipe(Effect.provide(testLayer))
  );
});
