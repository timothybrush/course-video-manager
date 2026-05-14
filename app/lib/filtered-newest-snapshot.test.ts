import { describe, it, expect } from "vitest";
import { filteredNewestSnapshot } from "./filtered-newest-snapshot";

interface TestSnapshot {
  id: string;
  preserved: boolean;
  createdAt: Date;
  clips: { archived: boolean }[];
}

function snap(
  id: string,
  opts: {
    preserved?: boolean;
    createdAt?: Date;
    clips?: { archived: boolean }[];
  } = {}
): TestSnapshot {
  return {
    id,
    preserved: opts.preserved ?? false,
    createdAt: opts.createdAt ?? new Date("2024-01-01"),
    clips: opts.clips ?? [],
  };
}

describe("filteredNewestSnapshot", () => {
  it("returns null when diagram has zero snapshots", () => {
    expect(filteredNewestSnapshot([])).toBeNull();
  });

  it("returns a preserved snapshot", () => {
    const s = snap("s1", { preserved: true });
    expect(filteredNewestSnapshot([s])).toBe("s1");
  });

  it("returns a non-preserved snapshot pinned by a non-archived clip", () => {
    const s = snap("s1", { clips: [{ archived: false }] });
    expect(filteredNewestSnapshot([s])).toBe("s1");
  });

  it("returns null for a non-preserved snapshot pinned only by an archived clip", () => {
    const s = snap("s1", { clips: [{ archived: true }] });
    expect(filteredNewestSnapshot([s])).toBeNull();
  });

  it("returns the newer of two qualifying snapshots", () => {
    const older = snap("s1", {
      preserved: true,
      createdAt: new Date("2024-01-01"),
    });
    const newer = snap("s2", {
      preserved: true,
      createdAt: new Date("2024-02-01"),
    });
    expect(filteredNewestSnapshot([older, newer])).toBe("s2");
  });

  it("returns the older qualifying snapshot when the newer one does not qualify", () => {
    const older = snap("s1", {
      preserved: true,
      createdAt: new Date("2024-01-01"),
    });
    const newer = snap("s2", {
      preserved: false,
      createdAt: new Date("2024-02-01"),
      clips: [{ archived: true }],
    });
    expect(filteredNewestSnapshot([older, newer])).toBe("s1");
  });

  it("returns a snapshot that is both preserved and pinned by an archived clip", () => {
    const s = snap("s1", {
      preserved: true,
      clips: [{ archived: true }],
    });
    expect(filteredNewestSnapshot([s])).toBe("s1");
  });
});
