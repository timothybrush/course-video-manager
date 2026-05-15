import { AddCourseModal } from "@/components/add-course-modal";
import { AddStandaloneVideoModal } from "@/components/add-standalone-video-modal";
import { RenameVideoModal } from "@/components/rename-video-modal";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  openPlayground,
  openPlaygroundWithDiagram,
} from "@/lib/diagram-window";
import {
  Archive,
  Eye,
  FolderGit2,
  FolderOpen,
  Lightbulb,
  Menu,
  PencilIcon,
  PenTool,
  Plus,
  VideoIcon,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Link, useFetcher, useLocation, useNavigate } from "react-router";

export interface AppSidebarProps {
  courses: Array<{
    id: string;
    name: string;
  }>;
  standaloneVideos: Array<{
    id: string;
    path: string;
  }>;
  pitches?: Array<{
    id: string;
    title: string;
  }>;
  diagrams?: Array<{
    id: string;
    name: string;
  }>;
  selectedCourseId?: string | null;
  isAddCourseModalOpen?: boolean;
  setIsAddCourseModalOpen?: (open: boolean) => void;
  isAddStandaloneVideoModalOpen?: boolean;
  setIsAddStandaloneVideoModalOpen?: (open: boolean) => void;
}

export function AppSidebar({
  courses,
  standaloneVideos,
  pitches = [],
  diagrams = [],
  selectedCourseId = null,
  isAddCourseModalOpen = false,
  setIsAddCourseModalOpen,
  isAddStandaloneVideoModalOpen = false,
  setIsAddStandaloneVideoModalOpen,
}: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const archiveCourseFetcher = useFetcher();
  const archiveVideoFetcher = useFetcher();
  const revealVideoFetcher = useFetcher();
  const createPitchFetcher = useFetcher<{ id: string }>();
  const createDiagramFetcher = useFetcher<{ id: string }>();

  const [isInternalAddVideoModalOpen, setIsInternalAddVideoModalOpen] =
    useState(false);
  const [videoToRename, setVideoToRename] = useState<{
    id: string;
    path: string;
  } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Close mobile sheet on navigation
  useEffect(() => {
    setSheetOpen(false);
  }, [location.pathname, location.search]);

  // Navigate to new pitch after creation
  useEffect(() => {
    if (createPitchFetcher.state === "idle" && createPitchFetcher.data?.id) {
      navigate(`/pitches/${createPitchFetcher.data.id}`);
    }
  }, [createPitchFetcher.state, createPitchFetcher.data, navigate]);

  // Open playground for newly created diagram
  const lastOpenedDiagramId = useRef<string | null>(null);
  useEffect(() => {
    const id = createDiagramFetcher.data?.id;
    if (
      createDiagramFetcher.state === "idle" &&
      id &&
      lastOpenedDiagramId.current !== id
    ) {
      lastOpenedDiagramId.current = id;
      openPlaygroundWithDiagram(id);
    }
  }, [createDiagramFetcher.state, createDiagramFetcher.data]);

  const sidebarContent = (
    <>
      {/* Courses Card */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Courses</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsAddCourseModalOpen?.(true)}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="space-y-0.5">
          {courses.map((course) => (
            <ContextMenu key={course.id}>
              <ContextMenuTrigger asChild>
                <Link
                  to={`/?courseId=${course.id}`}
                  preventScrollReset
                  className={cn(
                    "block w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-accent transition-colors truncate",
                    selectedCourseId === course.id &&
                      "bg-muted text-foreground/90"
                  )}
                >
                  {course.name}
                </Link>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onSelect={() => {
                    archiveCourseFetcher.submit(
                      { archived: "true" },
                      {
                        method: "post",
                        action: `/api/courses/${course.id}/archive`,
                      }
                    );
                  }}
                >
                  <Archive className="w-4 h-4" />
                  Archive
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
        <Link
          to="/archived-courses"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-2 px-2 transition-colors"
        >
          <Archive className="w-3 h-3" />
          Archived Courses
        </Link>
      </div>

      {/* Videos Card */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <VideoIcon className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Videos</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              if (setIsAddStandaloneVideoModalOpen) {
                setIsAddStandaloneVideoModalOpen(true);
              } else {
                setIsInternalAddVideoModalOpen(true);
              }
            }}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="space-y-0.5">
          {standaloneVideos.map((video) => (
            <ContextMenu key={video.id}>
              <ContextMenuTrigger asChild>
                <Link
                  to={`/videos/${video.id}/edit`}
                  preventScrollReset
                  className="block w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
                >
                  {video.path}
                </Link>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onSelect={() => {
                    setVideoToRename({ id: video.id, path: video.path });
                  }}
                >
                  <PencilIcon className="w-4 h-4" />
                  Rename
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => {
                    revealVideoFetcher.submit(
                      {},
                      {
                        method: "post",
                        action: `/api/videos/${video.id}/reveal`,
                      }
                    );
                  }}
                >
                  <FolderOpen className="w-4 h-4" />
                  Reveal in File System
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => {
                    archiveVideoFetcher.submit(
                      { archived: "true" },
                      {
                        method: "post",
                        action: `/api/videos/${video.id}/archive`,
                      }
                    );
                  }}
                >
                  <Archive className="w-4 h-4" />
                  Archive
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
        <Link
          to="/videos"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-2 px-2 transition-colors"
        >
          <Eye className="w-3 h-3" />
          View All Videos
        </Link>
      </div>

      {/* Pitches Card */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Pitches</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              createPitchFetcher.submit(
                {},
                { method: "post", action: "/api/pitches/create" }
              );
            }}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="space-y-0.5">
          {pitches.map((pitch) => (
            <Link
              key={pitch.id}
              to={`/pitches/${pitch.id}`}
              preventScrollReset
              className="block w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
            >
              {pitch.title || "Untitled Pitch"}
            </Link>
          ))}
        </div>
        <Link
          to="/pitches"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-2 px-2 transition-colors"
        >
          <Eye className="w-3 h-3" />
          View All Pitches
        </Link>
      </div>

      {/* Diagrams Card */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <PenTool className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Diagrams</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              createDiagramFetcher.submit(
                {},
                { method: "post", action: "/api/diagrams/create" }
              );
            }}
            disabled={createDiagramFetcher.state !== "idle"}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="space-y-0.5">
          {diagrams.map((diagram) => (
            <button
              key={diagram.id}
              onClick={() => openPlaygroundWithDiagram(diagram.id)}
              className="block w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-accent transition-colors truncate"
            >
              {diagram.name}
            </button>
          ))}
        </div>
        <button
          onClick={() => openPlayground()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-2 px-2 transition-colors"
        >
          <Eye className="w-3 h-3" />
          View All Diagrams
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Static sidebar for large screens */}
      <div className="w-80 border-r bg-muted/30 hidden lg:flex flex-col">
        <div className="p-4 flex-1 flex flex-col min-h-0">
          <div className="space-y-3 flex-1 overflow-y-auto">
            {sidebarContent}
          </div>
        </div>
      </div>

      {/* Floating menu button for smaller screens */}
      <Button
        className="lg:hidden fixed bottom-4 left-4 z-40 rounded-full shadow-lg size-12"
        size="icon"
        onClick={() => setSheetOpen(true)}
      >
        <Menu className="size-5" />
      </Button>

      {/* Mobile sidebar sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="p-0 flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <div className="p-4 flex-1 flex flex-col min-h-0">
            <div className="space-y-3 flex-1 overflow-y-auto">
              {sidebarContent}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modals */}
      {setIsAddCourseModalOpen && (
        <AddCourseModal
          isOpen={isAddCourseModalOpen}
          onOpenChange={setIsAddCourseModalOpen}
        />
      )}
      {setIsAddStandaloneVideoModalOpen ? (
        <AddStandaloneVideoModal
          open={isAddStandaloneVideoModalOpen}
          onOpenChange={setIsAddStandaloneVideoModalOpen}
        />
      ) : (
        <AddStandaloneVideoModal
          open={isInternalAddVideoModalOpen}
          onOpenChange={setIsInternalAddVideoModalOpen}
        />
      )}
      {videoToRename && (
        <RenameVideoModal
          videoId={videoToRename.id}
          currentName={videoToRename.path}
          open={true}
          onOpenChange={(open) => {
            if (!open) setVideoToRename(null);
          }}
        />
      )}
    </>
  );
}
