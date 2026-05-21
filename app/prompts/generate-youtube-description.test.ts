import { describe, it, expect } from "vitest";
import { generateYoutubeDescriptionPrompt } from "./generate-youtube-description";

const minimalOpts = {
  code: [],
  transcript: "Some transcript",
  images: [],
  youtubeChapters: [],
  links: [],
};

describe("generateYoutubeDescriptionPrompt", () => {
  it("includes the skills subscribe link in the footer", () => {
    const result = generateYoutubeDescriptionPrompt(minimalOpts);
    expect(result).toContain("https://aihero.dev/skills/subscribe");
  });

  it("does not include the old newsletter link", () => {
    const result = generateYoutubeDescriptionPrompt(minimalOpts);
    expect(result).not.toContain("https://aihero.dev/newsletter");
  });

  it("uses 'Keep up to date with my skills here' phrasing", () => {
    const result = generateYoutubeDescriptionPrompt(minimalOpts);
    expect(result).toContain("Keep up to date with my skills here");
  });
});
