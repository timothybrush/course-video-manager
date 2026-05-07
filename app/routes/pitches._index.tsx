import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PRIORITY_STYLES,
  STATUS_META,
  StatusIconBadge,
  PriorityPill,
  type PitchStatus,
  type PitchPriority,
} from "@/features/pitches-prototype/shared";
import { cn } from "@/lib/utils";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import { Console, Effect } from "effect";
import { ChevronDown, Filter, Lightbulb, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import {
  data,
  Link,
  useFetcher,
  useNavigate,
  useSearchParams,
} from "react-router";
import type { Route } from "./+types/pitches._index";

export const meta: Route.MetaFunction = () => {
  return [{ title: "CVM - Pitches" }];
};

const ALL_STATUSES: PitchStatus[] = ["idle", "scheduled", "cancelled"];

function parseStatusParam(raw: string | null): PitchStatus[] {
  if (!raw) return ["idle"];
  const values = [
    ...new Set(
      raw
        .split(",")
        .filter((s): s is PitchStatus =>
          ALL_STATUSES.includes(s as PitchStatus)
        )
    ),
  ];
  return values.length > 0 ? values : ["idle"];
}

function parsePriorityParam(raw: string | null): PitchPriority[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map(Number)
        .filter((n): n is PitchPriority => n === 1 || n === 2 || n === 3)
    ),
  ];
}

export const loader = async (args: Route.LoaderArgs) => {
  const url = new URL(args.request.url);
  const statusFilter = parseStatusParam(url.searchParams.get("status"));
  const priorityFilter = parsePriorityParam(url.searchParams.get("priority"));

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;

    const [courses, sidebarVideos, pitches] = yield* Effect.all(
      [
        db.getCourses(),
        db.getStandaloneVideosSidebar(),
        db.listPitches({
          status: statusFilter,
          priority: priorityFilter.length > 0 ? priorityFilter : undefined,
        }),
      ],
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
  const [searchParams, setSearchParams] = useSearchParams();

  const statusFilter = parseStatusParam(searchParams.get("status"));
  const priorityFilter = parsePriorityParam(searchParams.get("priority"));

  useEffect(() => {
    if (createPitchFetcher.state === "idle" && createPitchFetcher.data?.id) {
      navigate(`/pitches/${createPitchFetcher.data.id}`);
    }
  }, [createPitchFetcher.state, createPitchFetcher.data, navigate]);

  const sidebarPitches = pitches.slice(0, 5).map((p) => ({
    id: p.id,
    title: p.title,
  }));

  const updateFilters = (
    nextStatus: PitchStatus[],
    nextPriority: PitchPriority[]
  ) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);

      const isDefaultStatus =
        nextStatus.length === 1 && nextStatus[0] === "idle";
      if (isDefaultStatus) {
        next.delete("status");
      } else {
        next.set("status", nextStatus.join(","));
      }

      if (nextPriority.length === 0) {
        next.delete("priority");
      } else {
        next.set("priority", nextPriority.join(","));
      }

      return next;
    });
  };

  const togglePriority = (p: PitchPriority) => {
    const next = priorityFilter.includes(p)
      ? priorityFilter.filter((x) => x !== p)
      : [...priorityFilter, p];
    updateFilters(statusFilter, next);
  };

  const clearAll = () => {
    updateFilters(["idle"], []);
  };

  const hasActiveFilters =
    priorityFilter.length > 0 ||
    statusFilter.length !== 1 ||
    !statusFilter.includes("idle");

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
          <div className="flex items-center justify-between mb-6">
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

          <div className="mb-6">
            <div className="flex items-center gap-2 flex-wrap">
              {([1, 2, 3] as const).map((priority) => {
                const isSelected = priorityFilter.includes(priority);
                const showAsActive = priorityFilter.length === 0 || isSelected;
                return (
                  <button
                    key={priority}
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-sm font-medium transition-colors",
                      showAsActive
                        ? PRIORITY_STYLES[priority]
                        : "bg-muted text-muted-foreground hover:bg-muted/80",
                      isSelected && "ring-1 ring-current"
                    )}
                    onClick={() => togglePriority(priority)}
                  >
                    P{priority}
                  </button>
                );
              })}

              <span className="text-muted-foreground mx-0.5">|</span>

              <StatusFilterDropdown
                value={statusFilter}
                onChange={(next) => updateFilters(next, priorityFilter)}
              />

              {hasActiveFilters && (
                <>
                  <span className="text-muted-foreground mx-0.5">|</span>
                  <button
                    className="text-xs px-2 py-0.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors"
                    onClick={clearAll}
                  >
                    Clear all
                  </button>
                </>
              )}
            </div>
          </div>

          {pitches.length === 0 ? (
            <div className="text-center py-12">
              <Lightbulb className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No pitches yet</h3>
              <p className="text-muted-foreground">
                {hasActiveFilters
                  ? "No pitches match these filters."
                  : "Create a pitch to start packaging your next video idea."}
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

function StatusFilterDropdown({
  value,
  onChange,
}: {
  value: PitchStatus[];
  onChange: (v: PitchStatus[]) => void;
}) {
  const toggle = (s: PitchStatus) => {
    const next = value.includes(s)
      ? value.filter((x) => x !== s)
      : [...value, s];
    onChange(next.length > 0 ? next : ["idle"]);
  };

  const summary =
    value.length === ALL_STATUSES.length
      ? "All status"
      : value.map((s) => STATUS_META[s].label).join(", ");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">
          <Filter className="w-3 h-3" />
          {summary}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        {ALL_STATUSES.map((s) => {
          const m = STATUS_META[s];
          const Icon = m.icon;
          const isOn = value.includes(s);
          return (
            <DropdownMenuItem
              key={s}
              onClick={(e) => {
                e.preventDefault();
                toggle(s);
              }}
              className={cn(
                "text-xs font-medium flex items-center gap-2",
                isOn && "bg-accent"
              )}
            >
              <span
                className={cn(
                  "inline-flex items-center justify-center w-5 h-5 rounded-full",
                  m.iconWrap
                )}
              >
                <Icon className="w-3 h-3" />
              </span>
              <span className="flex-1">{m.label}</span>
              {isOn && <span className="text-xs opacity-60">✓</span>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
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
        <StatusIconBadge status={pitch.status as PitchStatus} readOnly />
        <Link
          to={`/pitches/${pitch.id}`}
          className="flex-1 min-w-0 font-medium truncate"
        >
          {pitch.title || "Untitled Pitch"}
        </Link>
        <PriorityPill priority={pitch.priority as PitchPriority} readOnly />
      </div>
      {pitch.description && (
        <p className="ml-12 mr-4 pb-3 text-xs text-muted-foreground line-clamp-2">
          {pitch.description}
        </p>
      )}
    </div>
  );
}
