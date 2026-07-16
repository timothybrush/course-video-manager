import { describe, it, expect } from "vitest";
import { selectStaleBlobs } from "./select-stale-blobs";

describe("selectStaleBlobs", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const maxAgeMs = 24 * 60 * 60 * 1000;

  it("a blob exactly at the threshold is NOT stale", () => {
    const atThreshold = new Date(now.getTime() - maxAgeMs);
    expect(
      selectStaleBlobs([{ url: "a", uploadedAt: atThreshold }], now, maxAgeMs)
    ).toEqual([]);
  });

  it("a blob older than the threshold IS stale", () => {
    const older = new Date(now.getTime() - maxAgeMs - 1);
    expect(
      selectStaleBlobs([{ url: "a", uploadedAt: older }], now, maxAgeMs)
    ).toEqual(["a"]);
  });

  it("returns only the stale urls", () => {
    const older = new Date(now.getTime() - maxAgeMs - 1000);
    const fresh = new Date(now.getTime() - 1000);
    expect(
      selectStaleBlobs(
        [
          { url: "old", uploadedAt: older },
          { url: "new", uploadedAt: fresh },
        ],
        now,
        maxAgeMs
      )
    ).toEqual(["old"]);
  });
});
