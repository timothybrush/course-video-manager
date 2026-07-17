import { courses, courseVersions } from "@/db/schema";
import type { Database } from "@/services/drizzle-service.server";
import {
  NotLatestVersionError,
  UnknownDBServiceError,
} from "@/services/db-service-errors";
import { withDbTransaction } from "@/services/with-db-transaction.server";
import { desc, eq, sql } from "drizzle-orm";
import { Effect } from "effect";

export type CopyVersionStructureInput = {
  sourceVersionId: string;
  repoId: string;
  newVersionName?: string;
};

const makeDbCall = <T>(fn: () => Promise<T>) =>
  Effect.tryPromise({
    try: fn,
    catch: (cause) => new UnknownDBServiceError({ cause }),
  });

export const lockCourseForVersionMutation = (
  transaction: Database,
  repoId: string
) =>
  makeDbCall(() =>
    transaction.execute(
      sql`select ${courses.id} from ${courses} where ${courses.id} = ${repoId} for update`
    )
  );

export const freezeAndCloneVersion = <A, E>(
  db: Database,
  input: CopyVersionStructureInput & {
    sourceName: string;
    sourceDescription: string;
  },
  copyVersionStructureInDb: (
    transaction: Database,
    input: CopyVersionStructureInput
  ) => Effect.Effect<A, E>
): Effect.Effect<A, E | NotLatestVersionError | UnknownDBServiceError> =>
  withDbTransaction(db, (transaction) =>
    Effect.gen(function* () {
      yield* lockCourseForVersionMutation(transaction, input.repoId);
      const latestVersion = yield* makeDbCall(() =>
        transaction.query.courseVersions.findFirst({
          where: eq(courseVersions.repoId, input.repoId),
          orderBy: desc(courseVersions.createdAt),
        })
      );
      if (!latestVersion || latestVersion.id !== input.sourceVersionId) {
        return yield* new NotLatestVersionError({
          sourceVersionId: input.sourceVersionId,
          latestVersionId: latestVersion?.id ?? "none",
        });
      }
      yield* makeDbCall(() =>
        transaction
          .update(courseVersions)
          .set({
            name: input.sourceName,
            description: input.sourceDescription,
          })
          .where(eq(courseVersions.id, input.sourceVersionId))
      );
      return yield* copyVersionStructureInDb(transaction, input);
    })
  );
