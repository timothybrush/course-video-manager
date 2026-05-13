import { Console, Effect } from "effect";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import type { Route } from "./+types/api.diagrams.$diagramId.head";
import { data } from "react-router";

export const loader = async (args: Route.LoaderArgs) => {
  const { diagramId } = args.params;

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const diagram = yield* db.getDiagram(diagramId);
    return data({ headScene: diagram.headScene });
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Diagram not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};

export const action = async (args: Route.ActionArgs) => {
  const { diagramId } = args.params;
  const body = await args.request.json();

  return Effect.gen(function* () {
    if (!body || typeof body !== "object") {
      return yield* Effect.die(
        data("Body must be a JSON object", { status: 400 })
      );
    }

    const db = yield* DBFunctionsService;
    const diagram = yield* db.updateDiagramHead(diagramId, body);
    return data({ ok: true, updatedAt: diagram.updatedAt.toISOString() });
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Diagram not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
