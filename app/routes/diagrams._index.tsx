import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import { Console, Effect } from "effect";
import { Archive, ArchiveRestore, PenTool, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { data, useFetcher, useSearchParams } from "react-router";
import type { Route } from "./+types/diagrams._index";

export const meta: Route.MetaFunction = () => {
  return [{ title: "CVM - Diagrams" }];
};

interface DiagramItem {
  id: string;
  name: string;
  archived: boolean;
  updatedAt: string;
}

export const loader = async (args: Route.LoaderArgs) => {
  const url = new URL(args.request.url);
  const showArchived = url.searchParams.get("archived") === "true";
  const nameFilter = url.searchParams.get("q") || undefined;

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;

    const [courses, sidebarVideos, pitchesRaw, diagramsRaw] = yield* Effect.all(
      [
        db.getCourses(),
        db.getStandaloneVideosSidebar(),
        db.listPitches(),
        db.listDiagrams({
          includeArchived: showArchived,
          nameFilter,
        }),
      ],
      { concurrency: "unbounded" }
    );

    const diagrams: DiagramItem[] = diagramsRaw.map((d) => ({
      id: d.id,
      name: d.name,
      archived: d.archived,
      updatedAt: d.updatedAt.toISOString(),
    }));

    const sidebarPitches = pitchesRaw.slice(0, 5).map((p) => ({
      id: p.id,
      title: p.title,
    }));

    return { courses, sidebarVideos, sidebarPitches, diagrams };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};

export default function DiagramsIndexRoute(props: Route.ComponentProps) {
  const { courses, sidebarVideos, sidebarPitches, diagrams } = props.loaderData;
  const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState(false);
  const [isAddVideoOpen, setIsAddVideoOpen] = useState(false);
  const createDiagramFetcher = useFetcher<{ id: string; name: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const showArchived = searchParams.get("archived") === "true";
  const nameFilter = searchParams.get("q") || "";

  const updateSearch = (q: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (q) {
        next.set("q", q);
      } else {
        next.delete("q");
      }
      return next;
    });
  };

  const toggleArchived = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (showArchived) {
        next.delete("archived");
      } else {
        next.set("archived", "true");
      }
      return next;
    });
  };

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
              <PenTool className="size-6" />
              Diagrams
              <span className="text-base font-normal text-muted-foreground">
                {diagrams.length}
              </span>
            </h1>
            <Button
              onClick={() => {
                createDiagramFetcher.submit(
                  {},
                  { method: "post", action: "/api/diagrams/create" }
                );
              }}
              disabled={createDiagramFetcher.state !== "idle"}
            >
              <Plus className="size-4 mr-1" /> New Diagram
            </Button>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Filter by name..."
                value={nameFilter}
                onChange={(e) => updateSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <button
              className={cn(
                "inline-flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-sm font-medium transition-colors",
                showArchived
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
              onClick={toggleArchived}
            >
              <Archive className="size-3" />
              {showArchived ? "Showing archived" : "Show archived"}
            </button>
          </div>

          {diagrams.length === 0 ? (
            <div className="text-center py-12">
              <PenTool className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No diagrams yet</h3>
              <p className="text-muted-foreground">
                {nameFilter
                  ? "No diagrams match this filter."
                  : "Create a diagram to start building your visual library."}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {diagrams.map((diagram) => (
                <DiagramRow key={diagram.id} diagram={diagram} />
              ))}
            </div>
          )}

          <div className="mt-6">
            <Button
              variant="outline"
              onClick={() => {
                createDiagramFetcher.submit(
                  {},
                  { method: "post", action: "/api/diagrams/create" }
                );
              }}
              disabled={createDiagramFetcher.state !== "idle"}
            >
              <Plus className="size-4 mr-1" /> New Diagram
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiagramRow({ diagram }: { diagram: DiagramItem }) {
  const renameFetcher = useFetcher();
  const archiveFetcher = useFetcher();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(diagram.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commitRename = () => {
    const trimmed = editValue.trim();
    setIsEditing(false);
    if (trimmed && trimmed !== diagram.name) {
      renameFetcher.submit(
        { name: trimmed },
        {
          method: "post",
          action: `/api/diagrams/${diagram.id}/update`,
        }
      );
    } else {
      setEditValue(diagram.name);
    }
  };

  const displayName =
    renameFetcher.formData?.get("name")?.toString() || diagram.name;

  const isArchived = archiveFetcher.formData?.has("archived")
    ? archiveFetcher.formData.get("archived") === "true"
    : diagram.archived;

  const updatedDate = new Date(diagram.updatedAt);
  const timeAgo = formatTimeAgo(updatedDate);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent/50 transition-colors group",
            isArchived && "opacity-60"
          )}
        >
          <PenTool className="size-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setEditValue(diagram.name);
                    setIsEditing(false);
                  }
                }}
                className="w-full bg-transparent text-sm font-medium outline-none border-b border-foreground/30 py-0.5"
              />
            ) : (
              <button
                className="text-sm font-medium truncate text-left w-full"
                onClick={() => {
                  setEditValue(diagram.name);
                  setIsEditing(true);
                }}
              >
                {displayName}
              </button>
            )}
          </div>
          {isArchived && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
              Archived
            </span>
          )}
          <span className="text-xs text-muted-foreground shrink-0">
            {timeAgo}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {isArchived ? (
          <ContextMenuItem
            onSelect={() => {
              archiveFetcher.submit(
                { archived: "false" },
                {
                  method: "post",
                  action: `/api/diagrams/${diagram.id}/update`,
                }
              );
            }}
          >
            <ArchiveRestore className="size-4" />
            Unarchive
          </ContextMenuItem>
        ) : (
          <ContextMenuItem
            onSelect={() => {
              archiveFetcher.submit(
                { archived: "true" },
                {
                  method: "post",
                  action: `/api/diagrams/${diagram.id}/update`,
                }
              );
            }}
          >
            <Archive className="size-4" />
            Archive
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
