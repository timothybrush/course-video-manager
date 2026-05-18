import { Console, Effect } from "effect";
import { Schema } from "effect";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";
import type { Route } from "./+types/api.deliverables.create";

const createSchema = Schema.Struct({
  title: Schema.String.pipe(Schema.minLength(1)),
  date: Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}$/)),
  notes: Schema.optional(Schema.String),
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const input = yield* Schema.decodeUnknown(createSchema)(formDataObject);

    const db = yield* DBFunctionsService;
    const deliverable = yield* db.createDeliverable({
      title: input.title,
      date: input.date,
      notes: input.notes,
    });

    return data({ id: deliverable.id });
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", () => {
      return Effect.die(data("Invalid request", { status: 400 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
