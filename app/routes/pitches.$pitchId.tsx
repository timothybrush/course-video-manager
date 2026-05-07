import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PrioritySelector,
  type Priority,
} from "@/components/priority-selector";
import {
  StatusIconBadge,
  type PitchStatus,
} from "@/components/status-icon-badge";
import { CoursePublishService } from "@/services/course-publish-service";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import { formatSecondsToTimeCode } from "@/services/utils";
import { Console, Effect } from "effect";
import {
  ArrowLeft,
  Check,
  FileVideo,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  Trash2,
  Video,
  Youtube,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { data, Link, useFetcher, useNavigate } from "react-router";
import type { Route } from "./+types/pitches.$pitchId";

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  const title = loaderData?.pitch?.title || "Untitled Pitch";
  return [{ title: `CVM - ${title}` }];
};

interface PitchVideo {
  id: string;
  path: string;
  firstClipId: string | null;
  totalDuration: number;
}

export const loader = async (args: Route.LoaderArgs) => {
  const { pitchId } = args.params;

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const publishService = yield* CoursePublishService;

    const pitchRaw = yield* db.getPitchWithVideos(pitchId);

    const hasExportedVideoMap: Record<string, boolean> = {};
    yield* Effect.forEach(
      pitchRaw.videos,
      (video) =>
        Effect.gen(function* () {
          hasExportedVideoMap[video.id] =
            yield* publishService.isExported(video);
        }),
      { concurrency: "unbounded" }
    );

    const videos: PitchVideo[] = pitchRaw.videos.map((v) => ({
      id: v.id,
      path: v.path,
      firstClipId: v.clips[0]?.id ?? null,
      totalDuration: v.clips.reduce(
        (acc, c) => acc + (c.sourceEndTime - c.sourceStartTime),
        0
      ),
    }));

    return {
      pitch: {
        id: pitchRaw.id,
        title: pitchRaw.title,
        description: pitchRaw.description,
        youtubeTitle: pitchRaw.youtubeTitle,
        youtubeThumbnailDescription: pitchRaw.youtubeThumbnailDescription,
        newsletterTitle: pitchRaw.newsletterTitle,
        tweet: pitchRaw.tweet,
        status: pitchRaw.status,
        priority: pitchRaw.priority,
      },
      videos,
      hasExportedVideoMap,
    };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("NotFoundError", () =>
      Effect.die(data("Pitch not found", { status: 404 }))
    ),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};

const SAVE_THROTTLE_MS = 600;

function usePitchAutoSave(pitchId: string) {
  const fetcher = useFetcher();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "saved">(
    "idle"
  );
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (field: string, value: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setSaveState("pending");

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fetcher.submit(
          { field, value },
          {
            method: "post",
            action: `/api/pitches/${pitchId}/update`,
          }
        );
      }, SAVE_THROTTLE_MS);
    },
    [fetcher, pitchId]
  );

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      saveState === "pending" &&
      !timerRef.current
    ) {
      setSaveState("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveState("idle"), 1200);
    }
  }, [fetcher.state, saveState]);

  return { save, saveState };
}

function SaveIndicator({ state }: { state: "idle" | "pending" | "saved" }) {
  if (state === "idle") return null;
  if (state === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Saving…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Check className="w-3 h-3" />
      Saved
    </span>
  );
}

function ChannelSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide pb-1.5 border-b">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default function PitchDetailRoute(props: Route.ComponentProps) {
  const { pitch: initialPitch, videos, hasExportedVideoMap } = props.loaderData;
  const navigate = useNavigate();
  const deleteFetcher = useFetcher();
  const statusFetcher = useFetcher();
  const priorityFetcher = useFetcher();
  const createVideoFetcher = useFetcher<{ id: string }>();

  const [title, setTitle] = useState(initialPitch.title);
  const [description, setDescription] = useState(initialPitch.description);
  const [youtubeTitle, setYoutubeTitle] = useState(initialPitch.youtubeTitle);
  const [youtubeThumbnailDescription, setYoutubeThumbnailDescription] =
    useState(initialPitch.youtubeThumbnailDescription);
  const [newsletterTitle, setNewsletterTitle] = useState(
    initialPitch.newsletterTitle
  );
  const [tweet, setTweet] = useState(initialPitch.tweet);
  const [status, setStatus] = useState<PitchStatus>(
    initialPitch.status as PitchStatus
  );
  const [priority, setPriority] = useState<Priority>(
    initialPitch.priority as Priority
  );

  const { save, saveState } = usePitchAutoSave(initialPitch.id);

  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data) {
      navigate("/pitches");
    }
  }, [deleteFetcher.state, deleteFetcher.data, navigate]);

  useEffect(() => {
    if (createVideoFetcher.state === "idle" && createVideoFetcher.data?.id) {
      navigate(`/videos/${createVideoFetcher.data.id}/edit`);
    }
  }, [createVideoFetcher.state, createVideoFetcher.data, navigate]);

  const handleFieldChange = (field: string, value: string) => {
    save(field, value);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <Link
            to="/pitches"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Pitches
          </Link>
          <div className="flex items-center gap-3">
            <SaveIndicator state={saveState} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                createVideoFetcher.submit(
                  {},
                  {
                    method: "post",
                    action: `/api/pitches/${initialPitch.id}/create-video`,
                  }
                );
              }}
              disabled={createVideoFetcher.state !== "idle"}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Video
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                deleteFetcher.submit(
                  {},
                  {
                    method: "post",
                    action: `/api/pitches/${initialPitch.id}/delete`,
                  }
                );
              }}
              disabled={deleteFetcher.state !== "idle"}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Delete
            </Button>
          </div>
        </div>

        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            handleFieldChange("title", e.target.value);
          }}
          aria-label="Title"
          placeholder="Untitled Pitch"
          className="text-3xl font-bold h-auto px-0 py-1 mb-3 border-0 shadow-none focus-visible:ring-0 focus-visible:border-b focus-visible:rounded-none md:text-3xl"
        />

        <div className="flex items-center gap-2 mb-8">
          <StatusIconBadge
            status={status}
            onSelect={(s) => {
              setStatus(s);
              statusFetcher.submit(
                { field: "status", value: s },
                {
                  method: "post",
                  action: `/api/pitches/${initialPitch.id}/update`,
                }
              );
            }}
          />
          <PrioritySelector
            priority={priority}
            onSelect={(p) => {
              setPriority(p);
              priorityFetcher.submit(
                { field: "priority", value: String(p) },
                {
                  method: "post",
                  action: `/api/pitches/${initialPitch.id}/update`,
                }
              );
            }}
          />
        </div>

        <div className="space-y-8">
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                handleFieldChange("description", e.target.value);
              }}
              rows={2}
            />
          </div>

          <ChannelSection icon={<Youtube className="size-4" />} title="YouTube">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Textarea
                value={youtubeTitle}
                onChange={(e) => {
                  setYoutubeTitle(e.target.value);
                  handleFieldChange("youtubeTitle", e.target.value);
                }}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Thumbnail concept</Label>
              <Textarea
                value={youtubeThumbnailDescription}
                onChange={(e) => {
                  setYoutubeThumbnailDescription(e.target.value);
                  handleFieldChange(
                    "youtubeThumbnailDescription",
                    e.target.value
                  );
                }}
                rows={2}
              />
            </div>
          </ChannelSection>

          <ChannelSection icon={<Mail className="size-4" />} title="Newsletter">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={newsletterTitle}
                onChange={(e) => {
                  setNewsletterTitle(e.target.value);
                  handleFieldChange("newsletterTitle", e.target.value);
                }}
              />
            </div>
          </ChannelSection>

          <ChannelSection
            icon={<MessageSquare className="size-4" />}
            title="Twitter"
          >
            <div className="space-y-1.5">
              <Label>Tweet</Label>
              <Textarea
                value={tweet}
                onChange={(e) => {
                  setTweet(e.target.value);
                  handleFieldChange("tweet", e.target.value);
                }}
                rows={2}
              />
            </div>
          </ChannelSection>

          <ChannelSection icon={<Video className="size-4" />} title="Videos">
            {videos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No videos yet. Click "+ Video" above to create one.
              </p>
            ) : (
              <div className="flex flex-wrap gap-4">
                {videos.map((video) => (
                  <Link
                    key={video.id}
                    to={`/videos/${video.id}/edit`}
                    className="text-left items-center group/thumb bg-muted rounded overflow-hidden inline-flex hover:ring-1 hover:ring-foreground/20 transition-all"
                  >
                    <div className="relative aspect-video w-32 bg-muted">
                      {video.firstClipId ? (
                        <img
                          src={`/clips/${video.firstClipId}/first-frame`}
                          alt={video.path}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center border-r">
                          <FileVideo className="w-6 h-6 text-muted-foreground/40" />
                        </div>
                      )}
                      {!hasExportedVideoMap[video.id] && (
                        <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-red-500" />
                      )}
                    </div>
                    <div className="py-1 px-6 flex flex-col items-center text-muted-foreground">
                      <span className="text-xs truncate text-foreground transition-colors">
                        {video.path || "Untitled"}
                      </span>
                      <span className="text-xs font-mono mt-0.5">
                        {formatSecondsToTimeCode(video.totalDuration)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </ChannelSection>
        </div>
      </div>
    </div>
  );
}
