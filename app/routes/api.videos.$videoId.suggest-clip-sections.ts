import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import {
  generateClipSectionsSystemPrompt,
  buildClipSectionsUserMessage,
} from "@/prompts/generate-clip-sections";
import { Console, Effect } from "effect";
import type { Route } from "./+types/api.videos.$videoId.suggest-clip-sections";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { data } from "react-router";
import { z } from "zod";

const proposalSchema = z.object({
  sections: z.array(
    z.object({
      beforeClipId: z.string(),
      title: z.string(),
    })
  ),
});

export const action = async (args: Route.ActionArgs) => {
  const videoId = args.params.videoId;

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const video = yield* db.getVideoWithClipsById(videoId);

    const clips = video.clips.map((c) => ({
      id: c.id,
      order: c.order,
      text: c.text ?? "",
    }));

    const existingSections = video.clipSections.map((s) => ({
      order: s.order,
      name: s.name,
    }));

    const userMessage = buildClipSectionsUserMessage({
      clips,
      existingSections,
    });

    const result = yield* Effect.tryPromise(() =>
      generateObject({
        model: anthropic("claude-sonnet-4-5"),
        schema: proposalSchema,
        system: generateClipSectionsSystemPrompt,
        messages: [{ role: "user", content: userMessage }],
      })
    );

    const validIds = new Set(clips.map((c) => c.id));
    const sections = result.object.sections.filter((s) =>
      validIds.has(s.beforeClipId)
    );

    return Response.json({
      sections,
      clips: clips.map((c) => ({ id: c.id, text: c.text })),
    });
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
