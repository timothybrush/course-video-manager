import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CourseEditorEvent } from "@/services/course-editor-service";
import { Plus } from "lucide-react";
import {
  SEGMENT_KINDS,
  SEGMENT_KIND_ICONS,
  SEGMENT_KIND_LABELS,
  type SegmentKind,
} from "./segment-kinds";
import { SegmentContextMenuContent } from "./segment-menu-items";
import { SegmentTitleEditor } from "./segment-title-editor";
import { SegmentSortableList, SortableSegment } from "./segment-dnd-context";

type PitchSegment = {
  id: string;
  videoId: string;
  kind: string;
  title: string;
  order: string;
};

/**
 * A pitch Video's ordered Segment plan: draggable rows (within and across the
 * pitch's Videos, via the surrounding {@link SegmentDndProvider}) plus an
 * "Add segment" menu offering the five kinds.
 */
export function PitchVideoSegments({
  video,
  submitEvent,
}: {
  video: { id: string; segments: PitchSegment[] };
  submitEvent: (event: CourseEditorEvent) => void;
}) {
  const segments = video.segments;

  return (
    <div className="space-y-1">
      <SegmentSortableList
        videoId={video.id}
        segmentIds={segments.map((s) => s.id)}
        className="space-y-0.5 min-h-[0.5rem]"
      >
        {segments.map((segment) => (
          <SortableSegment key={segment.id} id={segment.id}>
            <SegmentRow segment={segment} submitEvent={submitEvent} />
          </SortableSegment>
        ))}
      </SegmentSortableList>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">
            <Plus className="w-3 h-3" />
            Add segment
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {SEGMENT_KINDS.map((kind) => {
            const Icon = SEGMENT_KIND_ICONS[kind];
            return (
              <DropdownMenuItem
                key={kind}
                onSelect={() =>
                  submitEvent({
                    type: "create-segment",
                    videoId: video.id,
                    kind,
                  })
                }
              >
                <Icon className="w-4 h-4" />
                {SEGMENT_KIND_LABELS[kind]}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SegmentRow({
  segment,
  submitEvent,
}: {
  segment: PitchSegment;
  submitEvent: (event: CourseEditorEvent) => void;
}) {
  const kind = segment.kind as SegmentKind;
  const Icon = SEGMENT_KIND_ICONS[kind];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex items-center gap-1.5 text-sm text-foreground/80 cursor-context-menu">
          {Icon && (
            <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          )}
          <SegmentTitleEditor
            title={segment.title}
            placeholder={SEGMENT_KIND_LABELS[kind]}
            isReadOnly={false}
            onSave={(title) =>
              submitEvent({
                type: "rename-segment",
                segmentId: segment.id,
                title,
              })
            }
          />
        </div>
      </ContextMenuTrigger>
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
