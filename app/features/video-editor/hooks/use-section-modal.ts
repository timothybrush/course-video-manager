import { useState, useCallback, useEffect } from "react";
import type { FrontendId, TimelineItem } from "../clip-state-reducer.types";
import type { ClipSectionNamingModal } from "../types";

export const useSectionModal = (
  timelineItems: TimelineItem[],
  selectedClipsSet: Set<FrontendId>,
  onAddClipSection: (name: string) => void
) => {
  const [clipSectionNamingModal, setClipSectionNamingModal] =
    useState<ClipSectionNamingModal>(null);

  const generateDefaultClipSectionName = useCallback(() => {
    const existingClipSectionCount = timelineItems.filter(
      (item) =>
        item.type === "clip-section-on-database" ||
        item.type === "clip-section-optimistically-added"
    ).length;
    return `Section ${existingClipSectionCount + 1}`;
  }, [timelineItems]);

  const onEditSection = useCallback(
    (sectionId: FrontendId, currentName: string) => {
      setClipSectionNamingModal({
        mode: "edit",
        clipSectionId: sectionId,
        currentName,
      });
    },
    []
  );

  const onAddSectionBefore = useCallback(
    (itemId: FrontendId, defaultName: string) => {
      setClipSectionNamingModal({
        mode: "add-at",
        position: "before",
        itemId,
        defaultName,
      });
    },
    []
  );

  const onAddSectionAfter = useCallback(
    (itemId: FrontendId, defaultName: string) => {
      setClipSectionNamingModal({
        mode: "add-at",
        position: "after",
        itemId,
        defaultName,
      });
    },
    []
  );

  const onAddIntroSection = useCallback(() => {
    onAddClipSection("Intro");
  }, [onAddClipSection]);

  const onOpenCreateSectionModal = useCallback(() => {
    setClipSectionNamingModal({
      mode: "create",
      defaultName: generateDefaultClipSectionName(),
    });
  }, [generateDefaultClipSectionName]);

  useEffect(() => {
    const handleF2 = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLButtonElement &&
          !e.target.classList.contains("allow-keydown"))
      ) {
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        if (selectedClipsSet.size !== 1) return;
        const selectedId = Array.from(selectedClipsSet)[0]!;
        const selectedItem = timelineItems.find(
          (item) => item.frontendId === selectedId
        );
        if (
          selectedItem &&
          (selectedItem.type === "clip-section-on-database" ||
            selectedItem.type === "clip-section-optimistically-added")
        ) {
          onEditSection(selectedId, selectedItem.name);
        }
      }
    };
    window.addEventListener("keydown", handleF2);
    return () => window.removeEventListener("keydown", handleF2);
  }, [selectedClipsSet, timelineItems, onEditSection]);

  return {
    clipSectionNamingModal,
    setClipSectionNamingModal,
    generateDefaultClipSectionName,
    onEditSection,
    onAddSectionBefore,
    onAddSectionAfter,
    onAddIntroSection,
    onOpenCreateSectionModal,
  };
};
