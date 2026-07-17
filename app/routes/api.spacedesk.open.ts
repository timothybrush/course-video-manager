import { Effect, Schema } from "effect";
import { makeAction } from "@/services/route-action.server";
import { SpacedeskService } from "@/services/spacedesk-service";

const SpacedeskOpenPayload = Schema.Struct({
  ip: Schema.String.pipe(
    Schema.pattern(/^\d{1,3}(\.\d{1,3}){3}$/, {
      message: () => "Invalid IPv4 address",
    })
  ),
});

export const action = makeAction({
  dump: false,
  input: "json",
  effect: ({ payload }) =>
    Effect.gen(function* () {
      const { ip } = yield* Schema.decodeUnknown(SpacedeskOpenPayload)(payload);
      const spacedesk = yield* SpacedeskService;
      yield* spacedesk.wakeDisplay(ip);
      return { success: true as const };
    }).pipe(
      Effect.catchAll((error) =>
        Effect.succeed({ success: false as const, message: error.message })
      )
    ),
});
