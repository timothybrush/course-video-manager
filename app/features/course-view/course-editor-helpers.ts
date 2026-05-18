import type { CourseEditorEvent } from "@/services/course-editor-service";
import type { Section } from "./course-view-types";
import { arrayMove } from "@dnd-kit/sortable";
import { toast } from "sonner";
import {
  findNewOrderViolations,
  findNewSectionOrderViolations,
} from "@/utils/dependency-violations";
import type { DragEndEvent } from "@dnd-kit/core";

type DragItem = {
  id: string;
  title?: string | null;
  path: string;
  dependencies?: string[] | null;
};

export function createLessonDragHandler(
  submitEvent: (event: CourseEditorEvent) => void
) {
  return (sectionId: string, lessons: DragItem[]) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromIndex = lessons.findIndex((l) => l.id === active.id);
    const toIndex = lessons.findIndex((l) => l.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;

    const newOrder = arrayMove(lessons, fromIndex, toIndex);

    const newViolations = findNewOrderViolations(lessons, newOrder);
    if (newViolations.length > 0) {
      const details = newViolations
        .map((v) => `${v.lessonLabel} → ${v.depLabel}`)
        .join(", ");
      toast.warning("Dependency violation introduced", {
        description: details,
      });
    }

    submitEvent({
      type: "reorder-lessons",
      sectionId,
      lessonIds: newOrder.map((l) => l.id),
    });
  };
}

export function createSectionDragHandler(
  submitEvent: (event: CourseEditorEvent) => void
) {
  return (
      sections: { id: string; lessons: DragItem[] }[],
      _repoVersionId: string
    ) =>
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const fromIndex = sections.findIndex((s) => s.id === active.id);
      const toIndex = sections.findIndex((s) => s.id === over.id);
      if (fromIndex === -1 || toIndex === -1) return;

      const newOrder = arrayMove(sections, fromIndex, toIndex);

      const newViolations = findNewSectionOrderViolations(sections, newOrder);
      if (newViolations.length > 0) {
        const details = newViolations
          .map((v) => `${v.lessonLabel} → ${v.depLabel}`)
          .join(", ");
        toast.warning("Dependency violation introduced", {
          description: details,
        });
      }

      submitEvent({
        type: "reorder-sections",
        sectionIds: newOrder.map((s) => s.id),
      });
    };
}

export function computeFsStatusCounts(
  sections: Section[],
  filters: {
    priorityFilter: number[];
    iconFilter: string[];
    searchQuery: string;
  }
) {
  const { priorityFilter, iconFilter, searchQuery } = filters;
  const counts = { ghost: 0, real: 0, todo: 0 };
  for (const section of sections) {
    for (const lesson of section.lessons) {
      const passesPriority =
        priorityFilter.length === 0 ||
        priorityFilter.includes(lesson.priority ?? 2);
      const passesIcon =
        iconFilter.length === 0 || iconFilter.includes(lesson.icon ?? "watch");
      if (!passesPriority || !passesIcon) continue;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesPath = lesson.path.toLowerCase().includes(q);
        const matchesTitle = lesson.title?.toLowerCase().includes(q);
        const matchesDesc = lesson.description?.toLowerCase().includes(q);
        const matchesVideo = lesson.videos.some((v) =>
          v.path.toLowerCase().includes(q)
        );
        if (!matchesPath && !matchesTitle && !matchesDesc && !matchesVideo)
          continue;
      }

      const status = lesson.fsStatus ?? "real";
      if (status === "ghost") {
        counts.ghost++;
      } else {
        counts.real++;
        if (lesson.authoringStatus === "todo") counts.todo++;
      }
    }
  }
  return counts;
}

export function computeCourseStats(
  sections: Section[],
  filePath: string | null
) {
  const isGhostCourse = filePath === null;

  const shouldCount = (lesson: Section["lessons"][number]) =>
    isGhostCourse ? lesson.fsStatus === "ghost" : lesson.fsStatus !== "ghost";

  let totalLessons = 0;
  let totalLessonsWithVideos = 0;
  let totalVideos = 0;
  let totalDurationSeconds = 0;

  for (const section of sections) {
    for (const lesson of section.lessons) {
      if (!shouldCount(lesson)) continue;
      totalLessons++;
      if (lesson.videos.length > 0) totalLessonsWithVideos++;
      totalVideos += lesson.videos.length;
      for (const video of lesson.videos) {
        totalDurationSeconds += video.totalDuration;
      }
    }
  }

  const percentageComplete =
    totalLessons > 0
      ? Math.round((totalLessonsWithVideos / totalLessons) * 100)
      : 0;

  return {
    totalLessons,
    totalLessonsWithVideos,
    totalVideos,
    totalDurationSeconds,
    percentageComplete,
  };
}

export function computeFlatLessons(sections: Section[]) {
  return sections.flatMap((section, sectionIdx) =>
    section.lessons.map((lesson, lessonIdx) => ({
      id: lesson.id,
      number: `${sectionIdx + 1}.${lessonIdx + 1}`,
      title:
        lesson.fsStatus === "ghost" ? lesson.title || lesson.path : lesson.path,
      sectionId: section.id,
      sectionTitle: section.path,
      sectionNumber: sectionIdx + 1,
    }))
  );
}

export function computeDependencyMap(sections: Section[]) {
  const map: Record<string, string[]> = {};
  for (const section of sections) {
    for (const lesson of section.lessons) {
      if (lesson.dependencies && lesson.dependencies.length > 0) {
        map[lesson.id] = lesson.dependencies;
      }
    }
  }
  return map;
}
