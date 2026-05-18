import { describe, expect, it, vi } from "vitest";
import {
  createLessonDragHandler,
  computeFsStatusCounts,
  computeCourseStats,
} from "./course-editor-helpers";
import type { CourseEditorEvent } from "@/services/course-editor-service";
import type { DragEndEvent } from "@dnd-kit/core";
import type { Section, Lesson } from "./course-view-types";

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: "lesson-1",
    sectionId: "section-1",
    previousVersionLessonId: null,
    path: "lesson-path",
    title: null,
    fsStatus: "real",
    description: null,
    icon: null,
    priority: 2,
    dependencies: null,
    authoringStatus: "done",
    createdAt: "2026-01-01",
    order: "a0",
    videos: [],
    ...overrides,
  } as Lesson;
}

function makeSection(
  lessons: Lesson[],
  overrides: Partial<Section> = {}
): Section {
  return {
    id: "section-1",
    path: "section-path",
    fsStatus: "real",
    order: "a0",
    lessons,
    ...overrides,
  } as Section;
}

const noFilters = { priorityFilter: [], iconFilter: [], searchQuery: "" };

// Helper to create a fake DragEndEvent
function makeDragEndEvent(activeId: string, overId: string): DragEndEvent {
  return {
    active: {
      id: activeId,
      data: { current: undefined },
      rect: { current: { initial: null, translated: null } },
    },
    over: {
      id: overId,
      data: { current: undefined },
      rect: { left: 0, top: 0, bottom: 0, right: 0, width: 0, height: 0 },
    },
    activatorEvent: {} as Event,
    collisions: null,
    delta: { x: 0, y: 0 },
  } as unknown as DragEndEvent;
}

describe("createLessonDragHandler", () => {
  it("reorders lessons and submits the new order", () => {
    const submitEvent = vi.fn();
    const handler = createLessonDragHandler(submitEvent);

    const lessons = [
      { id: "db-1", path: "first", title: "First" },
      { id: "db-2", path: "second", title: "Second" },
      { id: "db-3", path: "third", title: "Third" },
    ];

    const dragEnd = handler("section-1", lessons);
    dragEnd(makeDragEndEvent("db-1", "db-3"));

    expect(submitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "reorder-lessons",
        sectionId: "section-1",
      })
    );
  });

  it("submits correct new lesson order after drag", () => {
    const submitEvent = vi.fn();
    const handler = createLessonDragHandler(submitEvent);

    const lessons = [
      { id: "db-1", path: "first", title: "First" },
      { id: "db-2", path: "second", title: "Second" },
      { id: "db-3", path: "third", title: "Third" },
    ];

    // Drag "db-1" to position of "db-3" → results in [second, third, first]
    const dragEnd = handler("section-1", lessons);
    dragEnd(makeDragEndEvent("db-1", "db-3"));

    const event = submitEvent.mock.calls[0]![0] as CourseEditorEvent & {
      type: "reorder-lessons";
      lessonIds: string[];
    };
    expect(event.type).toBe("reorder-lessons");
    expect(event.lessonIds).toEqual(["db-2", "db-3", "db-1"]);
  });

  it("returns without submitting when active and over are the same", () => {
    const submitEvent = vi.fn();
    const handler = createLessonDragHandler(submitEvent);
    const lessons = [{ id: "db-1", path: "first", title: "First" }];

    const dragEnd = handler("section-1", lessons);
    dragEnd(makeDragEndEvent("db-1", "db-1"));

    expect(submitEvent).not.toHaveBeenCalled();
  });

  it("returns without submitting when over is null", () => {
    const submitEvent = vi.fn();
    const handler = createLessonDragHandler(submitEvent);
    const lessons = [{ id: "db-1", path: "first", title: "First" }];

    const dragEnd = handler("section-1", lessons);
    dragEnd({
      active: { id: "db-1" },
      over: null,
      activatorEvent: {} as Event,
      collisions: null,
      delta: { x: 0, y: 0 },
    } as unknown as DragEndEvent);

    expect(submitEvent).not.toHaveBeenCalled();
  });

  it("returns without submitting when active ID is not found", () => {
    const submitEvent = vi.fn();
    const handler = createLessonDragHandler(submitEvent);
    const lessons = [
      { id: "db-1", path: "first", title: "First" },
      { id: "db-2", path: "second", title: "Second" },
    ];

    const dragEnd = handler("section-1", lessons);
    dragEnd(makeDragEndEvent("nonexistent", "db-2"));

    expect(submitEvent).not.toHaveBeenCalled();
  });

  it("returns without submitting when over ID is not found", () => {
    const submitEvent = vi.fn();
    const handler = createLessonDragHandler(submitEvent);
    const lessons = [{ id: "db-1", path: "first", title: "First" }];

    const dragEnd = handler("section-1", lessons);
    dragEnd(makeDragEndEvent("db-1", "nonexistent"));

    expect(submitEvent).not.toHaveBeenCalled();
  });

  it("returns without submitting on empty lessons array", () => {
    const submitEvent = vi.fn();
    const handler = createLessonDragHandler(submitEvent);

    const dragEnd = handler("section-1", []);
    dragEnd(makeDragEndEvent("db-1", "db-2"));

    expect(submitEvent).not.toHaveBeenCalled();
  });

  it("handles two-element reorder correctly", () => {
    const submitEvent = vi.fn();
    const handler = createLessonDragHandler(submitEvent);

    const lessons = [
      { id: "a", path: "first", title: "First" },
      { id: "b", path: "second", title: "Second" },
    ];

    const dragEnd = handler("section-1", lessons);
    dragEnd(makeDragEndEvent("a", "b"));

    const event = submitEvent.mock.calls[0]![0] as CourseEditorEvent & {
      type: "reorder-lessons";
      lessonIds: string[];
    };
    expect(event.lessonIds).toEqual(["b", "a"]);
  });

  it("handles dragging last element to first position", () => {
    const submitEvent = vi.fn();
    const handler = createLessonDragHandler(submitEvent);

    const lessons = [
      { id: "a", path: "first", title: "First" },
      { id: "b", path: "second", title: "Second" },
      { id: "c", path: "third", title: "Third" },
    ];

    const dragEnd = handler("section-1", lessons);
    dragEnd(makeDragEndEvent("c", "a"));

    const event = submitEvent.mock.calls[0]![0] as CourseEditorEvent & {
      type: "reorder-lessons";
      lessonIds: string[];
    };
    expect(event.lessonIds).toEqual(["c", "a", "b"]);
  });
});

describe("computeFsStatusCounts", () => {
  it("counts a todo lesson with no videos", () => {
    const sections = [
      makeSection([makeLesson({ authoringStatus: "todo", videos: [] })]),
    ];
    const counts = computeFsStatusCounts(sections, noFilters);
    expect(counts.todo).toBe(1);
  });

  it("counts a todo lesson that has videos with clips as todo", () => {
    const sections = [
      makeSection([
        makeLesson({
          authoringStatus: "todo",
          videos: [
            { id: "v1", path: "v.mp4", clipCount: 5, totalDuration: 100 },
          ] as Lesson["videos"],
        }),
      ]),
    ];
    const counts = computeFsStatusCounts(sections, noFilters);
    expect(counts.todo).toBe(1);
  });

  it("does not count a done lesson as todo", () => {
    const sections = [
      makeSection([makeLesson({ authoringStatus: "done", videos: [] })]),
    ];
    const counts = computeFsStatusCounts(sections, noFilters);
    expect(counts.todo).toBe(0);
  });

  it("does not count a ghost lesson as todo", () => {
    const sections = [
      makeSection([
        makeLesson({
          fsStatus: "ghost",
          authoringStatus: null,
          videos: [],
        }),
      ]),
    ];
    const counts = computeFsStatusCounts(sections, noFilters);
    expect(counts.todo).toBe(0);
    expect(counts.ghost).toBe(1);
  });

  it("counts all todos regardless of priority", () => {
    const sections = [
      makeSection([
        makeLesson({ id: "p1", authoringStatus: "todo", priority: 1 }),
        makeLesson({ id: "p2", authoringStatus: "todo", priority: 2 }),
        makeLesson({ id: "p3", authoringStatus: "todo", priority: 3 }),
      ]),
    ];
    const counts = computeFsStatusCounts(sections, noFilters);
    expect(counts.todo).toBe(3);
  });

  it("counts todo lessons as both real and todo", () => {
    const sections = [makeSection([makeLesson({ authoringStatus: "todo" })])];
    const counts = computeFsStatusCounts(sections, noFilters);
    expect(counts.real).toBe(1);
    expect(counts.todo).toBe(1);
  });

  it("returns all zeros for empty sections", () => {
    const counts = computeFsStatusCounts([], noFilters);
    expect(counts).toEqual({ ghost: 0, real: 0, todo: 0 });
  });

  it("excludes todo lessons that do not match priority filter", () => {
    const sections = [
      makeSection([
        makeLesson({ id: "p1", authoringStatus: "todo", priority: 1 }),
        makeLesson({ id: "p2", authoringStatus: "todo", priority: 2 }),
      ]),
    ];
    const counts = computeFsStatusCounts(sections, {
      ...noFilters,
      priorityFilter: [1],
    });
    expect(counts.todo).toBe(1);
  });

  it("treats null fsStatus as real", () => {
    const sections = [
      makeSection([
        makeLesson({
          fsStatus: null as unknown as string,
          authoringStatus: "todo",
        }),
      ]),
    ];
    const counts = computeFsStatusCounts(sections, noFilters);
    expect(counts.real).toBe(1);
    expect(counts.todo).toBe(1);
  });
});

describe("computeCourseStats", () => {
  const video = {
    id: "v1",
    path: "v.mp4",
    clipCount: 5,
    totalDuration: 120,
  } as Lesson["videos"][number];

  describe("real course (filePath is non-null)", () => {
    it("counts only non-ghost lessons as total", () => {
      const sections = [
        makeSection([
          makeLesson({ id: "l1", fsStatus: "real", videos: [video] }),
          makeLesson({ id: "l2", fsStatus: "ghost", videos: [] }),
        ]),
      ];
      const stats = computeCourseStats(sections, "/some/path");
      expect(stats.totalLessons).toBe(1);
    });

    it("counts non-ghost lessons with videos", () => {
      const sections = [
        makeSection([
          makeLesson({ id: "l1", fsStatus: "real", videos: [video] }),
          makeLesson({ id: "l2", fsStatus: "real", videos: [] }),
        ]),
      ];
      const stats = computeCourseStats(sections, "/some/path");
      expect(stats.totalLessonsWithVideos).toBe(1);
      expect(stats.totalLessons).toBe(2);
    });

    it("computes percentage correctly", () => {
      const sections = [
        makeSection([
          makeLesson({ id: "l1", fsStatus: "real", videos: [video] }),
          makeLesson({ id: "l2", fsStatus: "real", videos: [] }),
          makeLesson({ id: "l3", fsStatus: "real", videos: [] }),
          makeLesson({ id: "l4", fsStatus: "real", videos: [video] }),
        ]),
      ];
      const stats = computeCourseStats(sections, "/some/path");
      expect(stats.percentageComplete).toBe(50);
    });

    it("returns 0% when no lessons exist", () => {
      const stats = computeCourseStats([], "/some/path");
      expect(stats.percentageComplete).toBe(0);
      expect(stats.totalLessons).toBe(0);
    });
  });

  describe("ghost course (filePath is null)", () => {
    it("counts ghost lessons as total", () => {
      const sections = [
        makeSection([
          makeLesson({ id: "l1", fsStatus: "ghost", videos: [] }),
          makeLesson({ id: "l2", fsStatus: "ghost", videos: [] }),
        ]),
      ];
      const stats = computeCourseStats(sections, null);
      expect(stats.totalLessons).toBe(2);
    });

    it("counts ghost lessons with videos in numerator", () => {
      const sections = [
        makeSection([
          makeLesson({ id: "l1", fsStatus: "ghost", videos: [video] }),
          makeLesson({ id: "l2", fsStatus: "ghost", videos: [] }),
        ]),
      ];
      const stats = computeCourseStats(sections, null);
      expect(stats.totalLessonsWithVideos).toBe(1);
      expect(stats.totalLessons).toBe(2);
      expect(stats.percentageComplete).toBe(50);
    });

    it("returns 0% when ghost course has no lessons", () => {
      const stats = computeCourseStats([], null);
      expect(stats.percentageComplete).toBe(0);
      expect(stats.totalLessons).toBe(0);
    });

    it("counts total videos across ghost lessons", () => {
      const video2 = { ...video, id: "v2" } as Lesson["videos"][number];
      const sections = [
        makeSection([
          makeLesson({ id: "l1", fsStatus: "ghost", videos: [video, video2] }),
          makeLesson({ id: "l2", fsStatus: "ghost", videos: [video] }),
        ]),
      ];
      const stats = computeCourseStats(sections, null);
      expect(stats.totalVideos).toBe(3);
    });

    it("computes total duration across ghost lessons", () => {
      const longVideo = {
        ...video,
        id: "v2",
        totalDuration: 300,
      } as Lesson["videos"][number];
      const sections = [
        makeSection([
          makeLesson({ id: "l1", fsStatus: "ghost", videos: [video] }),
          makeLesson({
            id: "l2",
            fsStatus: "ghost",
            videos: [longVideo],
          }),
        ]),
      ];
      const stats = computeCourseStats(sections, null);
      expect(stats.totalDurationSeconds).toBe(420);
    });

    it("ignores real lessons in a ghost course", () => {
      const sections = [
        makeSection([
          makeLesson({ id: "l1", fsStatus: "real", videos: [video] }),
          makeLesson({ id: "l2", fsStatus: "ghost", videos: [] }),
        ]),
      ];
      const stats = computeCourseStats(sections, null);
      expect(stats.totalLessons).toBe(1);
      expect(stats.totalVideos).toBe(0);
    });
  });

  it("accumulates across multiple sections", () => {
    const sections = [
      makeSection(
        [makeLesson({ id: "l1", fsStatus: "real", videos: [video] })],
        { id: "s1" }
      ),
      makeSection(
        [makeLesson({ id: "l2", fsStatus: "real", videos: [video] })],
        { id: "s2" }
      ),
    ];
    const stats = computeCourseStats(sections, "/some/path");
    expect(stats.totalLessons).toBe(2);
    expect(stats.totalLessonsWithVideos).toBe(2);
    expect(stats.totalVideos).toBe(2);
    expect(stats.totalDurationSeconds).toBe(240);
    expect(stats.percentageComplete).toBe(100);
  });

  it("counts videos and duration only from matching lessons in a real course", () => {
    const sections = [
      makeSection([
        makeLesson({ id: "l1", fsStatus: "real", videos: [video] }),
        makeLesson({ id: "l2", fsStatus: "ghost", videos: [video] }),
      ]),
    ];
    const stats = computeCourseStats(sections, "/some/path");
    expect(stats.totalVideos).toBe(1);
    expect(stats.totalDurationSeconds).toBe(120);
  });

  it("returns all zeros when a real course has only ghost lessons", () => {
    const sections = [
      makeSection([
        makeLesson({ id: "l1", fsStatus: "ghost", videos: [video] }),
        makeLesson({ id: "l2", fsStatus: "ghost", videos: [] }),
      ]),
    ];
    const stats = computeCourseStats(sections, "/some/path");
    expect(stats.totalLessons).toBe(0);
    expect(stats.totalLessonsWithVideos).toBe(0);
    expect(stats.totalVideos).toBe(0);
    expect(stats.totalDurationSeconds).toBe(0);
    expect(stats.percentageComplete).toBe(0);
  });

  it("rounds percentage to nearest integer", () => {
    const sections = [
      makeSection([
        makeLesson({ id: "l1", fsStatus: "real", videos: [video] }),
        makeLesson({ id: "l2", fsStatus: "real", videos: [] }),
        makeLesson({ id: "l3", fsStatus: "real", videos: [] }),
      ]),
    ];
    const stats = computeCourseStats(sections, "/some/path");
    expect(stats.percentageComplete).toBe(33);
  });
});
