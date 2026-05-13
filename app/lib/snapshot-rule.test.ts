import { describe, it, expect } from "vitest";
import { shouldSnapshot } from "./snapshot-rule";

describe("shouldSnapshot", () => {
  it("returns true when all three conditions are met", () => {
    expect(
      shouldSnapshot({
        activeDiagramId: "diagram-1",
        clipScene: "Screencast",
        diagramFocusedDuringClip: true,
      })
    ).toBe(true);
  });

  it("returns false when activeDiagramId is null", () => {
    expect(
      shouldSnapshot({
        activeDiagramId: null,
        clipScene: "Screencast",
        diagramFocusedDuringClip: true,
      })
    ).toBe(false);
  });

  it("returns false when clipScene is Camera", () => {
    expect(
      shouldSnapshot({
        activeDiagramId: "diagram-1",
        clipScene: "Camera",
        diagramFocusedDuringClip: true,
      })
    ).toBe(false);
  });

  it("returns false when diagram was not focused during clip", () => {
    expect(
      shouldSnapshot({
        activeDiagramId: "diagram-1",
        clipScene: "Screencast",
        diagramFocusedDuringClip: false,
      })
    ).toBe(false);
  });

  it("returns false when activeDiagramId is null and clipScene is Camera", () => {
    expect(
      shouldSnapshot({
        activeDiagramId: null,
        clipScene: "Camera",
        diagramFocusedDuringClip: true,
      })
    ).toBe(false);
  });

  it("returns false when activeDiagramId is null and not focused", () => {
    expect(
      shouldSnapshot({
        activeDiagramId: null,
        clipScene: "Screencast",
        diagramFocusedDuringClip: false,
      })
    ).toBe(false);
  });

  it("returns false when clipScene is Camera and not focused", () => {
    expect(
      shouldSnapshot({
        activeDiagramId: "diagram-1",
        clipScene: "Camera",
        diagramFocusedDuringClip: false,
      })
    ).toBe(false);
  });

  it("returns false when all three conditions are false", () => {
    expect(
      shouldSnapshot({
        activeDiagramId: null,
        clipScene: "Camera",
        diagramFocusedDuringClip: false,
      })
    ).toBe(false);
  });

  it("treats empty string activeDiagramId as non-null", () => {
    expect(
      shouldSnapshot({
        activeDiagramId: "",
        clipScene: "Screencast",
        diagramFocusedDuringClip: true,
      })
    ).toBe(true);
  });

  it("uses exact match for Camera — other scene names pass", () => {
    for (const scene of ["Screencast", "Desktop", "camera", "CAMERA", ""]) {
      expect(
        shouldSnapshot({
          activeDiagramId: "diagram-1",
          clipScene: scene,
          diagramFocusedDuringClip: true,
        })
      ).toBe(true);
    }
  });
});
