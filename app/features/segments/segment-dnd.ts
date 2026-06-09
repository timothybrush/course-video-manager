/**
 * Pure drop-resolution for Segment drag-and-drop.
 *
 * Segments live in per-Video sortable lists inside one DndContext, so a drag
 * can land on another Segment (reorder / cross-video move) or on a Video's
 * drop zone (append to that Video). This module turns a dnd-kit
 * (activeId, overId) pair into the move intent — target Video + the Segment to
 * drop before (`null` = append) — independent of React.
 */

export const SEGMENT_CONTAINER_PREFIX = "seg-container:";

export function segmentContainerId(videoId: string): string {
  return `${SEGMENT_CONTAINER_PREFIX}${videoId}`;
}

export type SegmentDndVideo = {
  id: string;
  segments: { id: string }[];
};

export type SegmentDrop = {
  segmentId: string;
  targetVideoId: string;
  /** Place the moved Segment before this one; `null` appends to the end. */
  beforeSegmentId: string | null;
};

/**
 * Resolve a drag to a concrete move, or `null` when it's a no-op (dropped on
 * itself, or in the same position it already occupies).
 *
 * Rule: dropping onto a Segment inserts *before* that Segment; dropping onto a
 * Video's container appends to that Video's end.
 */
export function computeSegmentDrop({
  activeId,
  overId,
  videos,
}: {
  activeId: string;
  overId: string | null;
  videos: SegmentDndVideo[];
}): SegmentDrop | null {
  if (!overId || overId === activeId) return null;

  const videoOfSegment = new Map<string, string>();
  for (const video of videos) {
    for (const segment of video.segments) {
      videoOfSegment.set(segment.id, video.id);
    }
  }

  const sourceVideoId = videoOfSegment.get(activeId);
  if (!sourceVideoId) return null;

  let targetVideoId: string;
  let beforeSegmentId: string | null;

  if (overId.startsWith(SEGMENT_CONTAINER_PREFIX)) {
    targetVideoId = overId.slice(SEGMENT_CONTAINER_PREFIX.length);
    beforeSegmentId = null;
  } else {
    const overVideoId = videoOfSegment.get(overId);
    if (!overVideoId) return null;
    targetVideoId = overVideoId;
    beforeSegmentId = overId;
  }

  const targetVideo = videos.find((v) => v.id === targetVideoId);
  if (!targetVideo) return null;

  // Order of the target as it would look without the dragged segment.
  const remaining = targetVideo.segments
    .map((s) => s.id)
    .filter((id) => id !== activeId);

  const targetIndex =
    beforeSegmentId === null
      ? remaining.length
      : remaining.indexOf(beforeSegmentId);

  // No-op: the segment already sits exactly where it would land.
  if (sourceVideoId === targetVideoId) {
    const currentIndex = targetVideo.segments
      .map((s) => s.id)
      .indexOf(activeId);
    if (currentIndex === targetIndex) return null;
  }

  return { segmentId: activeId, targetVideoId, beforeSegmentId };
}
