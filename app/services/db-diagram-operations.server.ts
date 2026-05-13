import type { DrizzleDB } from "@/services/drizzle-service.server";
import { clips, diagrams, diagramSnapshots } from "@/db/schema";
import {
  NotFoundError,
  UnknownDBServiceError,
} from "@/services/db-service-errors";
import { and, asc, desc, eq, ilike, type SQL } from "drizzle-orm";
import { Effect } from "effect";
import { hashScene } from "@/lib/scene-hash";

const makeDbCall = <T>(fn: () => Promise<T>) => {
  return Effect.tryPromise({
    try: fn,
    catch: (e) => new UnknownDBServiceError({ cause: e }),
  });
};

export const createDiagramOperations = (db: DrizzleDB) => {
  const createDiagram = Effect.fn("createDiagram")(function* () {
    const existing = yield* makeDbCall(() =>
      db.query.diagrams.findMany({
        where: eq(diagrams.archived, false),
      })
    );

    const usedNumbers = new Set(
      existing
        .map((d) => {
          const match = d.name.match(/^Untitled (\d+)$/);
          return match ? Number(match[1]) : null;
        })
        .filter((n): n is number => n !== null)
    );

    let nextNumber = 1;
    while (usedNumbers.has(nextNumber)) {
      nextNumber++;
    }

    const results = yield* makeDbCall(() =>
      db
        .insert(diagrams)
        .values({ name: `Untitled ${nextNumber}` })
        .returning()
    );

    const diagram = results[0];
    if (!diagram) {
      return yield* new UnknownDBServiceError({
        cause: "No diagram was returned from the database",
      });
    }
    return diagram;
  });

  const listDiagrams = Effect.fn("listDiagrams")(function* (opts?: {
    includeArchived?: boolean;
    nameFilter?: string;
  }) {
    const conditions: SQL[] = [];
    if (!opts?.includeArchived) {
      conditions.push(eq(diagrams.archived, false));
    }
    if (opts?.nameFilter) {
      conditions.push(ilike(diagrams.name, `%${opts.nameFilter}%`));
    }

    return yield* makeDbCall(() =>
      db.query.diagrams.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        orderBy: [desc(diagrams.updatedAt)],
      })
    );
  });

  const getDiagram = Effect.fn("getDiagram")(function* (id: string) {
    const diagram = yield* makeDbCall(() =>
      db.query.diagrams.findFirst({
        where: eq(diagrams.id, id),
      })
    );

    if (!diagram) {
      return yield* new NotFoundError({
        type: "getDiagram",
        params: { id },
      });
    }
    return diagram;
  });

  const updateDiagram = Effect.fn("updateDiagram")(function* (
    id: string,
    fields: { name?: string; archived?: boolean }
  ) {
    const results = yield* makeDbCall(() =>
      db
        .update(diagrams)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(diagrams.id, id))
        .returning()
    );

    const diagram = results[0];
    if (!diagram) {
      return yield* new NotFoundError({
        type: "updateDiagram",
        params: { id },
      });
    }
    return diagram;
  });

  const updateDiagramHead = Effect.fn("updateDiagramHead")(function* (
    id: string,
    headScene: unknown
  ) {
    const results = yield* makeDbCall(() =>
      db
        .update(diagrams)
        .set({ headScene, updatedAt: new Date() })
        .where(eq(diagrams.id, id))
        .returning()
    );

    const diagram = results[0];
    if (!diagram) {
      return yield* new NotFoundError({
        type: "updateDiagramHead",
        params: { id },
      });
    }
    return diagram;
  });

  const createSnapshot = Effect.fn("createSnapshot")(function* (
    diagramId: string,
    opts: { preserved?: boolean }
  ) {
    const diagram = yield* makeDbCall(() =>
      db.query.diagrams.findFirst({
        where: eq(diagrams.id, diagramId),
      })
    );

    if (!diagram) {
      return yield* new NotFoundError({
        type: "createSnapshot",
        params: { diagramId },
      });
    }

    if (diagram.headScene == null) {
      return yield* new NotFoundError({
        type: "createSnapshot",
        params: { diagramId, reason: "headScene is null" },
      });
    }

    const contentHash = hashScene(diagram.headScene);
    const preserved = opts.preserved ?? false;

    const existing = yield* makeDbCall(() =>
      db.query.diagramSnapshots.findFirst({
        where: and(
          eq(diagramSnapshots.diagramId, diagramId),
          eq(diagramSnapshots.contentHash, contentHash)
        ),
      })
    );

    if (existing) {
      if (preserved && !existing.preserved) {
        const updated = yield* makeDbCall(() =>
          db
            .update(diagramSnapshots)
            .set({ preserved: true })
            .where(eq(diagramSnapshots.id, existing.id))
            .returning()
        );
        return updated[0]!;
      }
      return existing;
    }

    const results = yield* makeDbCall(() =>
      db
        .insert(diagramSnapshots)
        .values({
          diagramId,
          scene: diagram.headScene!,
          contentHash,
          preserved,
        })
        .returning()
    );

    const snapshot = results[0];
    if (!snapshot) {
      return yield* new UnknownDBServiceError({
        cause: "No snapshot was returned from the database",
      });
    }
    return snapshot;
  });

  const listSnapshots = Effect.fn("listSnapshots")(function* (
    diagramId: string
  ) {
    return yield* makeDbCall(() =>
      db.query.diagramSnapshots.findMany({
        where: eq(diagramSnapshots.diagramId, diagramId),
        orderBy: [asc(diagramSnapshots.createdAt)],
      })
    );
  });

  const listSnapshotsWithClips = Effect.fn("listSnapshotsWithClips")(function* (
    diagramId: string
  ) {
    return yield* makeDbCall(() =>
      db.query.diagramSnapshots.findMany({
        where: eq(diagramSnapshots.diagramId, diagramId),
        orderBy: [asc(diagramSnapshots.createdAt)],
        with: {
          clips: {
            columns: { id: true, archived: true },
          },
        },
      })
    );
  });

  const restoreSnapshotToHead = Effect.fn("restoreSnapshotToHead")(function* (
    diagramId: string,
    snapshotId: string
  ) {
    const snapshot = yield* makeDbCall(() =>
      db.query.diagramSnapshots.findFirst({
        where: and(
          eq(diagramSnapshots.id, snapshotId),
          eq(diagramSnapshots.diagramId, diagramId)
        ),
      })
    );

    if (!snapshot) {
      return yield* new NotFoundError({
        type: "restoreSnapshotToHead",
        params: { diagramId, snapshotId },
      });
    }

    const results = yield* makeDbCall(() =>
      db
        .update(diagrams)
        .set({ headScene: snapshot.scene, updatedAt: new Date() })
        .where(eq(diagrams.id, diagramId))
        .returning()
    );

    const diagram = results[0];
    if (!diagram) {
      return yield* new NotFoundError({
        type: "restoreSnapshotToHead",
        params: { diagramId },
      });
    }
    return diagram;
  });

  const createSnapshotForClip = Effect.fn("createSnapshotForClip")(function* (
    diagramId: string,
    clipId: string
  ) {
    const snapshot = yield* createSnapshot(diagramId, {});

    yield* makeDbCall(() =>
      db
        .update(clips)
        .set({ diagramSnapshotId: snapshot.id })
        .where(eq(clips.id, clipId))
    );

    return snapshot;
  });

  const updateClipDiagramPin = Effect.fn("updateClipDiagramPin")(function* (
    clipId: string,
    diagramSnapshotId: string | null
  ) {
    const results = yield* makeDbCall(() =>
      db
        .update(clips)
        .set({ diagramSnapshotId })
        .where(eq(clips.id, clipId))
        .returning()
    );

    const clip = results[0];
    if (!clip) {
      return yield* new NotFoundError({
        type: "updateClipDiagramPin",
        params: { clipId },
      });
    }
    return clip;
  });

  return {
    createDiagram,
    listDiagrams,
    getDiagram,
    updateDiagram,
    updateDiagramHead,
    createSnapshot,
    listSnapshots,
    listSnapshotsWithClips,
    restoreSnapshotToHead,
    createSnapshotForClip,
    updateClipDiagramPin,
  };
};
