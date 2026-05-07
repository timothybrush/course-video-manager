import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import { Console, Effect } from "effect";
import { Lightbulb, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { data, Link, useFetcher, useNavigate } from "react-router";
import type { Route } from "./+types/pitches._index";
import {
  PriorityPill,
  StatusIconBadge,
} from "@/features/pitches-prototype/shared";

export const meta: Route.MetaFunction = () => {
  return [{ title: "CVM - Pitches" }];
};

export const loader = async () => {
  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;

    const [courses, sidebarVideos, pitches] = yield* Effect.all(
      [db.getCourses(), db.getStandaloneVideosSidebar(), db.listPitches()],
      { concurrency: "unbounded" }
    );

    return {
      courses,
      sidebarVideos,
      pitches,
    };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};

export default function PitchesIndexRoute(props: Route.ComponentProps) {
  const { courses, sidebarVideos, pitches } = props.loaderData;
  const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState(false);
  const [isAddVideoOpen, setIsAddVideoOpen] = useState(false);
  const navigate = useNavigate();
  const createPitchFetcher = useFetcher<{ id: string }>();

  useEffect(() => {
    if (createPitchFetcher.state === "idle" && createPitchFetcher.data?.id) {
      navigate(`/pitches/${createPitchFetcher.data.id}`);
    }
  }, [createPitchFetcher.state, createPitchFetcher.data, navigate]);

  const sidebarPitches = pitches.slice(0, 5).map((p) => ({
    id: p.id,
    title: p.title,
  }));

  return (
    <div className="flex h-screen bg-background text-foreground">
      <AppSidebar
        courses={courses}
        standaloneVideos={sidebarVideos}
        pitches={sidebarPitches}
        isAddCourseModalOpen={isAddCourseModalOpen}
        setIsAddCourseModalOpen={setIsAddCourseModalOpen}
        isAddStandaloneVideoModalOpen={isAddVideoOpen}
        setIsAddStandaloneVideoModalOpen={setIsAddVideoOpen}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Lightbulb className="size-6" />
              Pitches
              <span className="text-base font-normal text-muted-foreground">
                {pitches.length}
              </span>
            </h1>
            <Button
              onClick={() => {
                createPitchFetcher.submit(
                  {},
                  { method: "post", action: "/api/pitches/create" }
                );
              }}
              disabled={createPitchFetcher.state !== "idle"}
            >
              <Plus className="size-4 mr-1" /> New Pitch
            </Button>
          </div>

          {pitches.length === 0 ? (
            <div className="text-center py-12">
              <Lightbulb className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No pitches yet</h3>
              <p className="text-muted-foreground">
                Create a pitch to start packaging your next video idea.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pitches.map((pitch) => (
                <PitchRow key={pitch.id} pitch={pitch} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PitchRow({
  pitch,
}: {
  pitch: {
    id: string;
    title: string;
    description: string;
    status: string;
    priority: number;
  };
}) {
  return (
    <div className="border rounded-lg bg-card hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-2 px-4 py-3">
        <StatusIconBadge
          status={pitch.status as "idle" | "scheduled" | "cancelled"}
          readOnly
        />
        <Link
          to={`/pitches/${pitch.id}`}
          className="flex-1 min-w-0 font-medium truncate"
        >
          {pitch.title || "Untitled Pitch"}
        </Link>
        <PriorityPill priority={pitch.priority as 1 | 2 | 3} readOnly />
      </div>
      {pitch.description && (
        <p className="ml-12 mr-4 pb-3 text-xs text-muted-foreground line-clamp-2">
          {pitch.description}
        </p>
      )}
    </div>
  );
}
