import { Console, Effect } from "effect";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";
import type { Route } from "./+types/api.deliverables.$deliverableId.archive";

export const action = async (args: Route.ActionArgs) => {
  const { deliverableId } = args.params;

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const deliverable = yield* db.archiveDeliverable(deliverableId);

    return data({ id: deliverable.id });
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
