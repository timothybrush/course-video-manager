import { cn } from "@/lib/utils";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import {
  computeSegmentDrop,
  segmentContainerId,
  type SegmentDndVideo,
  type SegmentDrop,
} from "./segment-dnd";

/**
 * One DndContext spanning a set of Videos, so Segments can be dragged to
 * reorder within a Video or moved into a sibling Video. Resolves each drop to a
 * {@link SegmentDrop} and hands it to `onMove`.
 */
export function SegmentDndProvider({
  videos,
  onMove,
  children,
}: {
  videos: SegmentDndVideo[];
  onMove: (drop: SegmentDrop) => void;
  children: ReactNode;
}) {
  // A small distance constraint so clicking the title/handle still fires clicks.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const drop = computeSegmentDrop({
      activeId: String(event.active.id),
      overId: event.over ? String(event.over.id) : null,
      videos,
    });
    if (drop) onMove(drop);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      {children}
    </DndContext>
  );
}

/**
 * A Video's Segment list: a droppable container (so an empty Video and the
 * end-of-list are valid drop targets) wrapping a vertical SortableContext.
 */
export function SegmentSortableList({
  videoId,
  segmentIds,
  className,
  children,
}: {
  videoId: string;
  segmentIds: string[];
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: segmentContainerId(videoId),
  });

  return (
    <SortableContext items={segmentIds} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        className={cn(className, isOver && "bg-primary/5 rounded")}
      >
        {children}
      </div>
    </SortableContext>
  );
}

/** A draggable Segment row with a grip handle; `children` is the row content. */
export function SortableSegment({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data: { type: "segment" } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1">
      <button
        ref={setActivatorNodeRef}
        className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/40 hover:text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3 h-3" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
