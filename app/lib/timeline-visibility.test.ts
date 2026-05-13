import { describe, it, expect } from "vitest";
import { isVisibleInTimeline } from "./timeline-visibility";

describe("isVisibleInTimeline", () => {
  it("returns true when snapshot is preserved and has no pinning clips", () => {
    const snapshot = { preserved: true };
    expect(isVisibleInTimeline(snapshot, [])).toBe(true);
  });

  it("returns true when snapshot is preserved and has pinning clips", () => {
    const snapshot = { preserved: true };
    const clips = [{ archived: false }];
    expect(isVisibleInTimeline(snapshot, clips)).toBe(true);
  });

  it("returns false when snapshot is not preserved and has no pinning clips", () => {
    const snapshot = { preserved: false };
    expect(isVisibleInTimeline(snapshot, [])).toBe(false);
  });

  it("returns false when snapshot is not preserved and all pinning clips are archived", () => {
    const snapshot = { preserved: false };
    const clips = [{ archived: true }, { archived: true }];
    expect(isVisibleInTimeline(snapshot, clips)).toBe(false);
  });

  it("returns false when snapshot is not preserved even with active pinning clips", () => {
    const snapshot = { preserved: false };
    const clips = [{ archived: false }];
    expect(isVisibleInTimeline(snapshot, clips)).toBe(false);
  });
});
