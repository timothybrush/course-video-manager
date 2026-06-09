import { describe, it, expect } from "vitest";
import {
  computeSegmentDrop,
  segmentContainerId,
  type SegmentDndVideo,
} from "./segment-dnd";

const videos: SegmentDndVideo[] = [
  { id: "v1", segments: [{ id: "a" }, { id: "b" }, { id: "c" }] },
  { id: "v2", segments: [{ id: "d" }] },
  { id: "v3", segments: [] },
];

describe("computeSegmentDrop", () => {
  it("returns null when dropped on itself", () => {
    expect(
      computeSegmentDrop({ activeId: "a", overId: "a", videos })
    ).toBeNull();
  });

  it("returns null with no over target", () => {
    expect(
      computeSegmentDrop({ activeId: "a", overId: null, videos })
    ).toBeNull();
  });

  it("reorders within a video, inserting before the hovered segment", () => {
    expect(computeSegmentDrop({ activeId: "a", overId: "c", videos })).toEqual({
      segmentId: "a",
      targetVideoId: "v1",
      beforeSegmentId: "c",
    });
  });

  it("is a no-op when dropping before the immediately-following segment", () => {
    // 'a' is already right before 'b' — landing before 'b' changes nothing.
    expect(
      computeSegmentDrop({ activeId: "a", overId: "b", videos })
    ).toBeNull();
  });

  it("moves across videos onto another video's segment", () => {
    expect(computeSegmentDrop({ activeId: "a", overId: "d", videos })).toEqual({
      segmentId: "a",
      targetVideoId: "v2",
      beforeSegmentId: "d",
    });
  });

  it("appends when dropped on a video's container", () => {
    expect(
      computeSegmentDrop({
        activeId: "a",
        overId: segmentContainerId("v2"),
        videos,
      })
    ).toEqual({
      segmentId: "a",
      targetVideoId: "v2",
      beforeSegmentId: null,
    });
  });

  it("moves into an empty video via its container", () => {
    expect(
      computeSegmentDrop({
        activeId: "a",
        overId: segmentContainerId("v3"),
        videos,
      })
    ).toEqual({
      segmentId: "a",
      targetVideoId: "v3",
      beforeSegmentId: null,
    });
  });

  it("is a no-op when appending a segment that is already last", () => {
    expect(
      computeSegmentDrop({
        activeId: "c",
        overId: segmentContainerId("v1"),
        videos,
      })
    ).toBeNull();
  });
});
