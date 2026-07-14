import { Badge } from "@/components/ui/badge";
import { useFocusRevalidate } from "@/hooks/use-focus-revalidate";
import { formatSecondsToTimeCode } from "@/services/utils";
import { VideoOperationsService } from "@/services/db-video-operations.server";
import { makeLoader } from "@/services/route-action.server";
import { Effect, Config } from "effect";
import { FileSystem } from "@effect/platform";
import { Clapperboard, VideoIcon } from "lucide-react";
import { Link } from "react-router";
import type { Route } from "./+types/_app.tiktoks._index";

export const meta: Route.MetaFunction = () => {
  return [{ title: "CVM - TikToks" }];
};

export const loader = makeLoader({
  effect: () =>
    Effect.gen(function* () {
      const videoOps = yield* VideoOperationsService;
      const fs = yield* FileSystem.FileSystem;
      const finishedDir = yield* Config.string("FINISHED_VIDEOS_DIRECTORY");

      const shorts = yield* videoOps.getAllStandaloneVideos({
        format: "short",
      });

      const renderedMap: Record<string, boolean> = {};
      yield* Effect.forEach(shorts, (video) =>
        Effect.gen(function* () {
          const mp4Path = `${finishedDir}/${video.id}.mp4`;
          renderedMap[video.id] = yield* fs.exists(mp4Path);
        })
      );

      return { shorts, renderedMap };
    }),
});

type ShortStatus = "recorded" | "rendered";

function getShortStatus(
  videoId: string,
  renderedMap: Record<string, boolean>
): ShortStatus {
  if (renderedMap[videoId]) return "rendered";
  return "recorded";
}

const STATUS_COLORS: Record<ShortStatus, string> = {
  recorded: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  rendered: "bg-green-500/15 text-green-700 dark:text-green-400",
};

const STATUS_LABELS: Record<ShortStatus, string> = {
  recorded: "Recorded",
  rendered: "Rendered",
};

export default function TikToksIndex(props: Route.ComponentProps) {
  const { shorts, renderedMap } = props.loaderData;

  useFocusRevalidate({ enabled: true });

  return (
    <div className="flex-1 flex flex-col bg-background text-foreground">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Clapperboard className="w-6 h-6" />
              TikToks
            </h1>
          </div>

          {shorts.length === 0 ? (
            <div className="text-center py-12">
              <Clapperboard className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No shorts yet</h3>
              <p className="text-muted-foreground">
                Short-form videos will appear here as a portrait gallery.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {shorts.map((video) => {
                const status = getShortStatus(video.id, renderedMap);
                const totalDuration = video.clips.reduce(
                  (acc, clip) =>
                    acc + (clip.sourceEndTime - clip.sourceStartTime),
                  0
                );

                return (
                  <Link
                    key={video.id}
                    to={`/videos/${video.id}/edit`}
                    className="group flex flex-col rounded-lg border bg-card overflow-hidden hover:border-foreground/20 transition-colors"
                  >
                    <div className="aspect-[9/16] bg-muted/50 flex items-center justify-center relative">
                      <VideoIcon className="w-8 h-8 text-muted-foreground/30" />
                      <div className="absolute top-2 right-2">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${STATUS_COLORS[status]}`}
                        >
                          {STATUS_LABELS[status]}
                        </Badge>
                      </div>
                      {totalDuration > 0 && (
                        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                          {formatSecondsToTimeCode(totalDuration)}
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-medium truncate group-hover:text-foreground/80">
                        {video.title}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
