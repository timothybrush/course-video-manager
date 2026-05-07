import type { DrizzleDB } from "@/services/drizzle-service.server";
import { pitches, videos } from "@/db/schema";
import {
  NotFoundError,
  UnknownDBServiceError,
} from "@/services/db-service-errors";
import { desc, eq } from "drizzle-orm";
import { Effect } from "effect";

const makeDbCall = <T>(fn: () => Promise<T>) => {
  return Effect.tryPromise({
    try: fn,
    catch: (e) => new UnknownDBServiceError({ cause: e }),
  });
};

export const createPitchOperations = (db: DrizzleDB) => {
  const createPitch = Effect.fn("createPitch")(function* () {
    const results = yield* makeDbCall(() =>
      db.insert(pitches).values({}).returning()
    );

    const pitch = results[0];

    if (!pitch) {
      return yield* new UnknownDBServiceError({
        cause: "No pitch was returned from the database",
      });
    }

    return pitch;
  });

  const listPitches = Effect.fn("listPitches")(function* () {
    return yield* makeDbCall(() =>
      db.query.pitches.findMany({
        where: eq(pitches.archived, false),
        orderBy: [desc(pitches.createdAt)],
      })
    );
  });

  const getPitch = Effect.fn("getPitch")(function* (id: string) {
    const pitch = yield* makeDbCall(() =>
      db.query.pitches.findFirst({
        where: eq(pitches.id, id),
      })
    );

    if (!pitch) {
      return yield* new NotFoundError({
        type: "getPitch",
        params: { id },
      });
    }

    return pitch;
  });

  const updatePitchField = Effect.fn("updatePitchField")(function* (
    id: string,
    field: string,
    value: string | number | boolean
  ) {
    const results = yield* makeDbCall(() =>
      db
        .update(pitches)
        .set({ [field]: value, updatedAt: new Date() })
        .where(eq(pitches.id, id))
        .returning()
    );

    const pitch = results[0];

    if (!pitch) {
      return yield* new NotFoundError({
        type: "updatePitchField",
        params: { id, field },
      });
    }

    return pitch;
  });

  const deletePitch = Effect.fn("deletePitch")(function* (id: string) {
    yield* makeDbCall(() =>
      db.update(videos).set({ pitchId: null }).where(eq(videos.pitchId, id))
    );

    yield* makeDbCall(() => db.delete(pitches).where(eq(pitches.id, id)));
  });

  return {
    createPitch,
    listPitches,
    getPitch,
    updatePitchField,
    deletePitch,
  };
};
