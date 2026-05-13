import type { DrizzleDB } from "@/services/drizzle-service.server";
import { diagrams } from "@/db/schema";
import {
  NotFoundError,
  UnknownDBServiceError,
} from "@/services/db-service-errors";
import { and, desc, eq, ilike, type SQL } from "drizzle-orm";
import { Effect } from "effect";

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

  return {
    createDiagram,
    listDiagrams,
    getDiagram,
    updateDiagram,
    updateDiagramHead,
  };
};
