import { describe, expect, it } from "vitest";
import { hasNewSuccessForTypes } from "./use-upload-revalidate";

describe("hasNewSuccessForTypes", () => {
  it("returns true when a matching upload type transitions to success", () => {
    const prev = {
      "upload-1": {
        status: "uploading" as const,
        uploadType: "buffer" as const,
      },
    };
    const current = {
      "upload-1": {
        status: "success" as const,
        uploadType: "buffer" as const,
      },
    };
    expect(hasNewSuccessForTypes(prev, current, new Set(["buffer"]))).toBe(
      true
    );
  });

  it("returns false when a non-matching upload type transitions to success", () => {
    const prev = {
      "upload-1": {
        status: "uploading" as const,
        uploadType: "youtube" as const,
      },
    };
    const current = {
      "upload-1": {
        status: "success" as const,
        uploadType: "youtube" as const,
      },
    };
    expect(hasNewSuccessForTypes(prev, current, new Set(["buffer"]))).toBe(
      false
    );
  });

  it("returns false when status has not changed", () => {
    const prev = {
      "upload-1": {
        status: "uploading" as const,
        uploadType: "buffer" as const,
      },
    };
    const current = {
      "upload-1": {
        status: "uploading" as const,
        uploadType: "buffer" as const,
      },
    };
    expect(hasNewSuccessForTypes(prev, current, new Set(["buffer"]))).toBe(
      false
    );
  });

  it("returns false when upload is new (not in prev)", () => {
    const prev = {};
    const current = {
      "upload-1": {
        status: "success" as const,
        uploadType: "buffer" as const,
      },
    };
    expect(hasNewSuccessForTypes(prev, current, new Set(["buffer"]))).toBe(
      false
    );
  });

  it("returns true when any one of multiple uploads matches", () => {
    const prev = {
      "upload-1": {
        status: "uploading" as const,
        uploadType: "youtube" as const,
      },
      "upload-2": {
        status: "uploading" as const,
        uploadType: "youtube-shorts" as const,
      },
    };
    const current = {
      "upload-1": {
        status: "uploading" as const,
        uploadType: "youtube" as const,
      },
      "upload-2": {
        status: "success" as const,
        uploadType: "youtube-shorts" as const,
      },
    };
    expect(
      hasNewSuccessForTypes(prev, current, new Set(["youtube-shorts"]))
    ).toBe(true);
  });

  it("returns false when upload transitions to error instead of success", () => {
    const prev = {
      "upload-1": {
        status: "uploading" as const,
        uploadType: "buffer" as const,
      },
    };
    const current = {
      "upload-1": {
        status: "error" as const,
        uploadType: "buffer" as const,
      },
    };
    expect(hasNewSuccessForTypes(prev, current, new Set(["buffer"]))).toBe(
      false
    );
  });

  it("checks multiple types in the set", () => {
    const prev = {
      "upload-1": {
        status: "uploading" as const,
        uploadType: "render-vertical" as const,
      },
    };
    const current = {
      "upload-1": {
        status: "success" as const,
        uploadType: "render-vertical" as const,
      },
    };
    expect(
      hasNewSuccessForTypes(
        prev,
        current,
        new Set(["buffer", "youtube-shorts", "render-vertical", "export"])
      )
    ).toBe(true);
  });
});
