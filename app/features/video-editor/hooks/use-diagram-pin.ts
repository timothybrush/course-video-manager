import { useState, useCallback } from "react";
import type { FrontendId, TimelineItem } from "../clip-state-reducer.types";

export type UpdateClipDiagramPinFn = (
  clipFrontendId: FrontendId,
  clipDatabaseId: string,
  diagramSnapshotId: string | null,
  diagramName: string | null
) => void;

export const useDiagramPin = (
  items: TimelineItem[],
  onUpdateClipDiagramPin: UpdateClipDiagramPinFn
) => {
  const [attachDiagramClipId, setAttachDiagramClipId] =
    useState<FrontendId | null>(null);

  const onUnpinDiagram = useCallback(
    (clipId: FrontendId) => {
      const clip = items.find(
        (c) => c.frontendId === clipId && c.type === "on-database"
      );
      if (clip?.type === "on-database") {
        onUpdateClipDiagramPin(clipId, clip.databaseId as string, null, null);
      }
    },
    [items, onUpdateClipDiagramPin]
  );

  const onAttachDiagram = useCallback((clipId: FrontendId) => {
    setAttachDiagramClipId(clipId);
  }, []);

  const onAttachDiagramSelect = useCallback(
    (clipId: FrontendId, snapshotId: string, diagramName: string) => {
      const clip = items.find(
        (c) => c.frontendId === clipId && c.type === "on-database"
      );
      if (clip?.type === "on-database") {
        onUpdateClipDiagramPin(
          clipId,
          clip.databaseId as string,
          snapshotId,
          diagramName
        );
      }
    },
    [items, onUpdateClipDiagramPin]
  );

  const closeAttachDialog = useCallback(() => {
    setAttachDiagramClipId(null);
  }, []);

  return {
    attachDiagramClipId,
    onUnpinDiagram,
    onAttachDiagram,
    onAttachDiagramSelect,
    closeAttachDialog,
  };
};
