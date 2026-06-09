import { describe, it, expect } from "@effect/vitest";
import { beforeAll, beforeEach } from "vitest";
import { Effect, Layer } from "effect";
import { SegmentOperationsService } from "@/services/db-segment-operations.server";
import { DrizzleService } from "@/services/drizzle-service.server";
import { videos } from "@/db/schema";
import { compareOrderStrings } from "@/lib/sort-by-order";
import {
  createTestDb,
  truncateAllTables,
  type TestDb,
} from "@/test-utils/pglite";

let testDb: TestDb;
let testLayer: Layer.Layer<SegmentOperationsService>;

beforeAll(async () => {
  const result = await createTestDb();
  testDb = result.testDb;

  testLayer = SegmentOperationsService.Default.pipe(
    Layer.provide(Layer.succeed(DrizzleService, testDb as any))
  );
});

beforeEach(async () => {
  await truncateAllTables(testDb);
});

const makeVideo = async (id: string) => {
  await testDb.insert(videos).values({
    id,
    path: `${id}.mp4`,
    originalFootagePath: `/footage/${id}`,
  });
};

describe("createSegment", () => {
  it.effect("defaults to the definition kind with an empty title", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => makeVideo("video-1"));
      const segmentOps = yield* SegmentOperationsService;

      const segment = yield* segmentOps.createSegment("video-1");

      expect(segment.kind).toBe("definition");
      expect(segment.title).toBe("");
      expect(segment.videoId).toBe("video-1");
      expect(segment.order).toEqual(expect.any(String));
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("uses the provided kind", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => makeVideo("video-1"));
      const segmentOps = yield* SegmentOperationsService;

      const segment = yield* segmentOps.createSegment("video-1", "quest");

      expect(segment.kind).toBe("quest");
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("slots new segments at the end, in creation order", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => makeVideo("video-1"));
      const segmentOps = yield* SegmentOperationsService;

      const first = yield* segmentOps.createSegment("video-1");
      const second = yield* segmentOps.createSegment("video-1");
      const third = yield* segmentOps.createSegment("video-1");

      expect(compareOrderStrings(first.order, second.order)).toBeLessThan(0);
      expect(compareOrderStrings(second.order, third.order)).toBeLessThan(0);

      const listed = yield* segmentOps.listSegmentsByVideoId("video-1");
      expect(listed.map((s) => s.id)).toEqual([first.id, second.id, third.id]);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("scopes order to each video independently", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => makeVideo("video-1"));
      yield* Effect.promise(() => makeVideo("video-2"));
      const segmentOps = yield* SegmentOperationsService;

      yield* segmentOps.createSegment("video-1");
      yield* segmentOps.createSegment("video-2");

      const v1 = yield* segmentOps.listSegmentsByVideoId("video-1");
      const v2 = yield* segmentOps.listSegmentsByVideoId("video-2");
      expect(v1).toHaveLength(1);
      expect(v2).toHaveLength(1);
    }).pipe(Effect.provide(testLayer))
  );
});

describe("renameSegment", () => {
  it.effect("updates the title", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => makeVideo("video-1"));
      const segmentOps = yield* SegmentOperationsService;
      const created = yield* segmentOps.createSegment("video-1");

      const renamed = yield* segmentOps.renameSegment(created.id, "Closures");

      expect(renamed.title).toBe("Closures");
      expect(renamed.kind).toBe("definition");
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("fails when the segment does not exist", () =>
    Effect.gen(function* () {
      const segmentOps = yield* SegmentOperationsService;
      const result = yield* segmentOps
        .renameSegment("missing", "x")
        .pipe(Effect.either);
      expect(result._tag).toBe("Left");
    }).pipe(Effect.provide(testLayer))
  );
});

describe("setSegmentKind", () => {
  it.effect("changes the kind while preserving the title", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => makeVideo("video-1"));
      const segmentOps = yield* SegmentOperationsService;
      const created = yield* segmentOps.createSegment("video-1");
      yield* segmentOps.renameSegment(created.id, "Intro");

      const updated = yield* segmentOps.setSegmentKind(
        created.id,
        "playthrough"
      );

      expect(updated.kind).toBe("playthrough");
      expect(updated.title).toBe("Intro");
    }).pipe(Effect.provide(testLayer))
  );
});

describe("deleteSegment", () => {
  it.effect("hard-deletes the row (not archived)", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => makeVideo("video-1"));
      const segmentOps = yield* SegmentOperationsService;
      const created = yield* segmentOps.createSegment("video-1");

      yield* segmentOps.deleteSegment(created.id);

      const remaining = yield* segmentOps.listSegmentsByVideoId("video-1");
      expect(remaining).toHaveLength(0);
    }).pipe(Effect.provide(testLayer))
  );
});

describe("moveSegment", () => {
  it.effect("reorders within a video, producing a key between neighbours", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => makeVideo("video-1"));
      const segmentOps = yield* SegmentOperationsService;
      const a = yield* segmentOps.createSegment("video-1");
      const b = yield* segmentOps.createSegment("video-1");
      const c = yield* segmentOps.createSegment("video-1");

      // Move c to sit before b → order a, c, b.
      yield* segmentOps.moveSegment(c.id, "video-1", b.id);

      const listed = yield* segmentOps.listSegmentsByVideoId("video-1");
      expect(listed.map((s) => s.id)).toEqual([a.id, c.id, b.id]);
      const moved = listed.find((s) => s.id === c.id)!;
      expect(compareOrderStrings(a.order, moved.order)).toBeLessThan(0);
      expect(compareOrderStrings(moved.order, b.order)).toBeLessThan(0);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("appends to the end when beforeSegmentId is null", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => makeVideo("video-1"));
      const segmentOps = yield* SegmentOperationsService;
      const a = yield* segmentOps.createSegment("video-1");
      const b = yield* segmentOps.createSegment("video-1");

      yield* segmentOps.moveSegment(a.id, "video-1", null);

      const listed = yield* segmentOps.listSegmentsByVideoId("video-1");
      expect(listed.map((s) => s.id)).toEqual([b.id, a.id]);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect(
    "reassigns videoId and orders within the target on cross-video move",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => makeVideo("video-1"));
        yield* Effect.promise(() => makeVideo("video-2"));
        const segmentOps = yield* SegmentOperationsService;
        const a = yield* segmentOps.createSegment("video-1");
        const d = yield* segmentOps.createSegment("video-2");

        // Move a into video-2, before d → video-2: [a, d]; video-1 empty.
        const moved = yield* segmentOps.moveSegment(a.id, "video-2", d.id);

        expect(moved.videoId).toBe("video-2");
        const v1 = yield* segmentOps.listSegmentsByVideoId("video-1");
        const v2 = yield* segmentOps.listSegmentsByVideoId("video-2");
        expect(v1).toHaveLength(0);
        expect(v2.map((s) => s.id)).toEqual([a.id, d.id]);
      }).pipe(Effect.provide(testLayer))
  );
});
