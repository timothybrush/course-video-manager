import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { Link, type useNavigate, type useFetcher } from "react-router";
import { courseViewReducer } from "@/features/course-view/course-view-reducer";
import type { CourseEditorEvent } from "@/services/course-editor-service";
import {
  SEGMENT_KIND_ICONS,
  SEGMENT_KIND_LABELS,
  type SegmentKind,
} from "@/features/segments/segment-kinds";
import { SegmentContextMenuContent } from "@/features/segments/segment-menu-items";
import { SegmentTitleEditor } from "@/features/segments/segment-title-editor";
import {
  SegmentDndProvider,
  SegmentSortableList,
  SortableSegment,
} from "@/features/segments/segment-dnd-context";
import { VideoContextMenuItems } from "./video-context-menu";
import type {
  LoaderData,
  Lesson,
  Section,
  Segment,
  Video,
} from "./course-view-types";

/**
 * Compact-view text tree under a lesson: lesson → videos (sorted by name) →
 * ordered Segments. Always fully expanded (no collapsibility in V1). See
 * docs/adr/0015-video-level-segment-planning.md.
 */
/**
 * Callbacks/data the Video context menu needs, threaded down from the lesson
 * item so the compact tree's right-click menu matches the expanded view's.
 */
type VideoMenuProps = {
  section: Section;
  data: LoaderData;
  navigate: ReturnType<typeof useNavigate>;
  dispatch: (action: courseViewReducer.Action) => void;
  startExportUpload: (videoId: string, path: string) => void;
  revealVideoFetcher: ReturnType<typeof useFetcher>;
  deleteVideoFileFetcher: ReturnType<typeof useFetcher>;
  submitDeleteVideo: (videoId: string) => void;
};

export function LessonSegmentTree({
  lesson,
  isReadOnly,
  submitEvent,
  ...videoMenuProps
}: {
  lesson: Lesson;
  isReadOnly: boolean;
  submitEvent: (event: CourseEditorEvent) => void;
} & VideoMenuProps) {
  const videos = [...lesson.videos].sort((a, b) =>
    a.path.localeCompare(b.path)
  );

  if (videos.length === 0) return null;

  const tree = (
    <div
      className={cn(
        "mt-1 space-y-1",
        // Indent the video/segment text to start at the lesson title, so it
        // clears the icon-to-icon dependency spine. The editable row carries an
        // extra drag grip ahead of the icon, so it needs more leading.
        isReadOnly ? "ml-9" : "ml-[3.625rem]"
      )}
    >
      {videos.map((video) => (
        <VideoSegmentNode
          key={video.id}
          video={video}
          lesson={lesson}
          isReadOnly={isReadOnly}
          submitEvent={submitEvent}
          {...videoMenuProps}
        />
      ))}
    </div>
  );

  if (isReadOnly) return tree;

  return (
    <SegmentDndProvider
      videos={videos.map((v) => ({
        id: v.id,
        segments: v.segments ?? [],
      }))}
      onMove={(drop) =>
        submitEvent({
          type: "move-segment",
          segmentId: drop.segmentId,
          targetVideoId: drop.targetVideoId,
          beforeSegmentId: drop.beforeSegmentId,
        })
      }
    >
      {tree}
    </SegmentDndProvider>
  );
}

function VideoSegmentNode({
  video,
  lesson,
  isReadOnly,
  submitEvent,
  ...videoMenuProps
}: {
  video: Video;
  lesson: Lesson;
  isReadOnly: boolean;
  submitEvent: (event: CourseEditorEvent) => void;
} & VideoMenuProps) {
  const segments = video.segments ?? [];

  const videoRow = (
    <Link
      to={`/videos/${video.id}/edit`}
      className="block mb-1 text-muted-foreground truncate hover:text-foreground hover:underline"
    >
      {video.path}
    </Link>
  );

  return (
    <div className="text-xs">
      <ContextMenu>
        <ContextMenuTrigger asChild>{videoRow}</ContextMenuTrigger>
        <VideoContextMenuItems
          video={video}
          lesson={lesson}
          submitEvent={submitEvent}
          {...videoMenuProps}
        />
      </ContextMenu>
      <SegmentSortableList
        videoId={video.id}
        segmentIds={segments.map((s) => s.id)}
        className="mt-0.5 space-y-0.5 min-h-[0.75rem]"
      >
        {segments.map((segment) =>
          isReadOnly ? (
            <SegmentNode
              key={segment.id}
              segment={segment}
              isReadOnly={isReadOnly}
              submitEvent={submitEvent}
            />
          ) : (
            <SortableSegment key={segment.id} id={segment.id}>
              <SegmentNode
                segment={segment}
                isReadOnly={isReadOnly}
                submitEvent={submitEvent}
              />
            </SortableSegment>
          )
        )}
      </SegmentSortableList>
    </div>
  );
}

function SegmentNode({
  segment,
  isReadOnly,
  submitEvent,
}: {
  segment: Segment;
  isReadOnly: boolean;
  submitEvent: (event: CourseEditorEvent) => void;
}) {
  const kind = segment.kind as SegmentKind;
  const Icon = SEGMENT_KIND_ICONS[kind];

  const row = (
    <div className="flex items-center gap-1.5 text-foreground/80 cursor-context-menu">
      {Icon && <Icon className="w-3 h-3 shrink-0 text-muted-foreground" />}
      <SegmentTitleEditor
        title={segment.title}
        placeholder={SEGMENT_KIND_LABELS[kind]}
        isReadOnly={isReadOnly}
        onSave={(title) =>
          submitEvent({
            type: "rename-segment",
            segmentId: segment.id,
            title,
          })
        }
      />
    </div>
  );

  if (isReadOnly) return row;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        <SegmentContextMenuContent
          onSetKind={(nextKind) =>
            submitEvent({
              type: "set-segment-kind",
              segmentId: segment.id,
              kind: nextKind,
            })
          }
          onDelete={() =>
            submitEvent({ type: "delete-segment", segmentId: segment.id })
          }
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}
