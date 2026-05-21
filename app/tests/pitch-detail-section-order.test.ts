import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const PITCH_DETAIL_PATH = path.join(
  __dirname,
  "..",
  "routes",
  "_app.pitches.$pitchId.tsx"
);

describe("pitch detail page section order", () => {
  it("renders Videos section immediately after Content Plan", () => {
    const content = fs.readFileSync(PITCH_DETAIL_PATH, "utf-8");

    const contentPlanIndex = content.indexOf(">Content Plan<");
    const videosIndex = content.indexOf('title="Videos"');
    const youtubeIndex = content.indexOf('title="YouTube"');
    const newsletterIndex = content.indexOf('title="Newsletter"');

    expect(contentPlanIndex).toBeGreaterThan(-1);
    expect(videosIndex).toBeGreaterThan(-1);
    expect(youtubeIndex).toBeGreaterThan(-1);
    expect(newsletterIndex).toBeGreaterThan(-1);

    expect(videosIndex).toBeGreaterThan(contentPlanIndex);
    expect(videosIndex).toBeLessThan(youtubeIndex);
  });
});
