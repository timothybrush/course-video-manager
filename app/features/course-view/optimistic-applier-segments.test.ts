import { describe, it, expect } from "vitest";
import { applyOptimisticEvent } from "./optimistic-applier";
import {
  makeVideo,
  makeLesson,
  makeSection,
  makeLoaderData,
} from "./optimistic-applier-test-helpers";
import type { CourseEditorEvent } from "@/services/course-editor-service";
import type { Segment } from "./course-view-types";

const makeSegment = (overrides: Partial<Segment> = {}): Segment =>
  ({
    id: "seg-1",
    videoId: "video-1",
    kind: "definition",
    title: "",
    order: "a0",
    ...overrides,
  }) as Segment;

const loaderWithSegments = (segments: Segment[], videoId = "video-1") =>
  makeLoaderData([
    makeSection({}, [
      makeLesson({ videos: [makeVideo({ id: videoId, segments })] }),
    ]),
  ]);

const segmentsOf = (data: ReturnType<typeof loaderWithSegments>) =>
  data.selectedCourse!.sections[0]!.lessons[0]!.videos[0]!.segments;

describe("rename-segment", () => {
  it("updates the matching segment's title", () => {
    const data = loaderWithSegments([makeSegment({ id: "seg-1", title: "" })]);
    const event: CourseEditorEvent = {
      type: "rename-segment",
      segmentId: "seg-1",
      title: "Closures",
    };

    const result = applyOptimisticEvent(data, event);

    expect(segmentsOf(result)[0]!.title).toBe("Closures");
  });

  it("does not mutate the original loaderData", () => {
    const data = loaderWithSegments([makeSegment({ id: "seg-1", title: "" })]);
    applyOptimisticEvent(data, {
      type: "rename-segment",
      segmentId: "seg-1",
      title: "Closures",
    });
    expect(segmentsOf(data)[0]!.title).toBe("");
  });

  it("returns loaderData unchanged when the segment is not found", () => {
    const data = loaderWithSegments([makeSegment({ id: "seg-1" })]);
    const result = applyOptimisticEvent(data, {
      type: "rename-segment",
      segmentId: "nope",
      title: "x",
    });
    expect(result).toBe(data);
  });
});

describe("set-segment-kind", () => {
  it("changes the matching segment's kind", () => {
    const data = loaderWithSegments([
      makeSegment({ id: "seg-1", kind: "definition" }),
    ]);
    const result = applyOptimisticEvent(data, {
      type: "set-segment-kind",
      segmentId: "seg-1",
      kind: "quest",
    });
    expect(segmentsOf(result)[0]!.kind).toBe("quest");
  });
});

describe("delete-segment", () => {
  it("removes the matching segment", () => {
    const data = loaderWithSegments([
      makeSegment({ id: "seg-1" }),
      makeSegment({ id: "seg-2", order: "a1" }),
    ]);
    const result = applyOptimisticEvent(data, {
      type: "delete-segment",
      segmentId: "seg-1",
    });
    expect(segmentsOf(result).map((s) => s.id)).toEqual(["seg-2"]);
  });

  it("returns loaderData unchanged when the segment is not found", () => {
    const data = loaderWithSegments([makeSegment({ id: "seg-1" })]);
    const result = applyOptimisticEvent(data, {
      type: "delete-segment",
      segmentId: "nope",
    });
    expect(result).toBe(data);
  });

  it("preserves reference equality for untouched sections", () => {
    const segVideo = makeVideo({ id: "video-1", segments: [makeSegment()] });
    const section1 = makeSection({ id: "s1" }, [
      makeLesson({ id: "l1", videos: [segVideo] }),
    ]);
    const section2 = makeSection({ id: "s2" }, [makeLesson({ id: "l2" })]);
    const data = makeLoaderData([section1, section2]);

    const result = applyOptimisticEvent(data, {
      type: "delete-segment",
      segmentId: "seg-1",
    });

    expect(result.selectedCourse!.sections[1]).toBe(section2);
  });
});

describe("move-segment", () => {
  const twoVideoLoader = () =>
    makeLoaderData([
      makeSection({}, [
        makeLesson({
          id: "l1",
          videos: [
            makeVideo({
              id: "v1",
              segments: [
                makeSegment({ id: "a", order: "a0" }),
                makeSegment({ id: "b", order: "a1" }),
              ],
            }),
            makeVideo({ id: "v2", path: "v2.mp4", segments: [] }),
          ],
        }),
      ]),
    ]);

  const videoSegs = (
    data: ReturnType<typeof twoVideoLoader>,
    videoIdx: number
  ) => data.selectedCourse!.sections[0]!.lessons[0]!.videos[videoIdx]!.segments;

  it("reorders within a video", () => {
    const data = twoVideoLoader();
    const result = applyOptimisticEvent(data, {
      type: "move-segment",
      segmentId: "b",
      targetVideoId: "v1",
      beforeSegmentId: "a",
    });
    expect(videoSegs(result, 0).map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("moves a segment into another video and updates its videoId", () => {
    const data = twoVideoLoader();
    const result = applyOptimisticEvent(data, {
      type: "move-segment",
      segmentId: "a",
      targetVideoId: "v2",
      beforeSegmentId: null,
    });
    expect(videoSegs(result, 0).map((s) => s.id)).toEqual(["b"]);
    expect(videoSegs(result, 1).map((s) => s.id)).toEqual(["a"]);
    expect(videoSegs(result, 1)[0]!.videoId).toBe("v2");
  });

  it("does not mutate the original loaderData", () => {
    const data = twoVideoLoader();
    applyOptimisticEvent(data, {
      type: "move-segment",
      segmentId: "a",
      targetVideoId: "v2",
      beforeSegmentId: null,
    });
    expect(videoSegs(data, 0).map((s) => s.id)).toEqual(["a", "b"]);
    expect(videoSegs(data, 1)).toHaveLength(0);
  });

  it("returns loaderData unchanged when the segment is not found", () => {
    const data = twoVideoLoader();
    const result = applyOptimisticEvent(data, {
      type: "move-segment",
      segmentId: "nope",
      targetVideoId: "v2",
      beforeSegmentId: null,
    });
    expect(result).toBe(data);
  });
});
