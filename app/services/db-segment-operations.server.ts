import {
  DrizzleService,
  type DrizzleDB,
} from "@/services/drizzle-service.server";
import { segments } from "@/db/schema";
import {
  NotFoundError,
  UnknownDBServiceError,
} from "@/services/db-service-errors";
import {
  DEFAULT_SEGMENT_KIND,
  type SegmentKind,
} from "@/features/segments/segment-kinds";
import { asc, eq } from "drizzle-orm";
import { generateNKeysBetween } from "fractional-indexing";
import { Effect } from "effect";

const makeDbCall = <T>(fn: () => Promise<T>) => {
  return Effect.tryPromise({
    try: fn,
    catch: (e) => new UnknownDBServiceError({ cause: e }),
  });
};

export const createSegmentOperations = (db: DrizzleDB) => {
  /** Segments of a video, sorted by their fractional `order` key. */
  const listSegmentsByVideoId = (videoId: string) =>
    makeDbCall(() =>
      db.query.segments.findMany({
        where: eq(segments.videoId, videoId),
        orderBy: asc(segments.order),
      })
    );

  /**
   * Create a Segment slotted at the end of the Video's plan, with an empty
   * title and the given kind (defaulting to Definition).
   */
  const createSegment = Effect.fn("createSegment")(function* (
    videoId: string,
    kind: SegmentKind = DEFAULT_SEGMENT_KIND
  ) {
    const existing = yield* listSegmentsByVideoId(videoId);
    const lastOrder = existing.at(-1)?.order ?? null;
    const [order] = generateNKeysBetween(lastOrder, null, 1);

    const [segment] = yield* makeDbCall(() =>
      db
        .insert(segments)
        .values({
          videoId,
          kind,
          title: "",
          order: order!,
        })
        .returning()
    );

    if (!segment) {
      return yield* new UnknownDBServiceError({
        cause: "No segment was returned from the database",
      });
    }

    return segment;
  });

  const requireSegment = (id: string) =>
    Effect.gen(function* () {
      const [updated] = yield* makeDbCall(() =>
        db.select().from(segments).where(eq(segments.id, id))
      );
      if (!updated) {
        return yield* new NotFoundError({ type: "segment", params: { id } });
      }
      return updated;
    });

  const renameSegment = Effect.fn("renameSegment")(function* (
    id: string,
    title: string
  ) {
    yield* makeDbCall(() =>
      db.update(segments).set({ title }).where(eq(segments.id, id))
    );
    return yield* requireSegment(id);
  });

  const setSegmentKind = Effect.fn("setSegmentKind")(function* (
    id: string,
    kind: SegmentKind
  ) {
    yield* makeDbCall(() =>
      db.update(segments).set({ kind }).where(eq(segments.id, id))
    );
    return yield* requireSegment(id);
  });

  /** Hard delete — Segments have no published footprint, so they are not archived. */
  const deleteSegment = Effect.fn("deleteSegment")(function* (id: string) {
    yield* makeDbCall(() => db.delete(segments).where(eq(segments.id, id)));
    return { success: true as const };
  });

  /**
   * Move a Segment within its Video (reorder) or into another Video. Reassigns
   * `videoId` to the target and computes a fractional key strictly between the
   * drop neighbours. `beforeSegmentId === null` appends to the target's end.
   * Mirrors the cross-section lesson move shape (ADR 0011/0013).
   */
  const moveSegment = Effect.fn("moveSegment")(function* (
    segmentId: string,
    targetVideoId: string,
    beforeSegmentId: string | null
  ) {
    yield* requireSegment(segmentId);

    // The target's segments as they'd look without the moved one.
    const targetSegments = yield* listSegmentsByVideoId(targetVideoId);
    const remaining = targetSegments.filter((s) => s.id !== segmentId);

    let prevOrder: string | null;
    let nextOrder: string | null;
    if (beforeSegmentId === null) {
      prevOrder = remaining.at(-1)?.order ?? null;
      nextOrder = null;
    } else {
      const idx = remaining.findIndex((s) => s.id === beforeSegmentId);
      if (idx === -1) {
        return yield* new NotFoundError({
          type: "segment",
          params: { id: beforeSegmentId },
        });
      }
      prevOrder = remaining[idx - 1]?.order ?? null;
      nextOrder = remaining[idx]!.order;
    }

    const [order] = generateNKeysBetween(prevOrder, nextOrder, 1);

    yield* makeDbCall(() =>
      db
        .update(segments)
        .set({ videoId: targetVideoId, order: order! })
        .where(eq(segments.id, segmentId))
    );

    return yield* requireSegment(segmentId);
  });

  return {
    listSegmentsByVideoId,
    createSegment,
    renameSegment,
    setSegmentKind,
    deleteSegment,
    moveSegment,
  };
};

export class SegmentOperationsService extends Effect.Service<SegmentOperationsService>()(
  "SegmentOperationsService",
  {
    effect: Effect.gen(function* () {
      const db = yield* DrizzleService;
      return createSegmentOperations(db);
    }),
  }
) {}
