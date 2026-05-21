import { describe, it, expect } from "vitest";
import { stripEmojis } from "./strip-emojis";

describe("stripEmojis", () => {
  it("removes common emojis from text", () => {
    expect(stripEmojis("Hello 🌍 World 🎉")).toBe("Hello World");
  });

  it("preserves plain text without emojis", () => {
    expect(stripEmojis("Just plain text here")).toBe("Just plain text here");
  });

  it("removes emojis while keeping special characters", () => {
    expect(stripEmojis("Check out https://example.com — it's great!")).toBe(
      "Check out https://example.com — it's great!"
    );
  });

  it("handles text with only emojis", () => {
    expect(stripEmojis("🎬🔥✨")).toBe("");
  });

  it("removes emoji sequences like flags and skin tones", () => {
    expect(stripEmojis("Hello 👋🏽 there")).toBe("Hello there");
  });

  it("collapses leftover double spaces from removed emojis", () => {
    expect(stripEmojis("Hello 🌍 World")).toBe("Hello World");
  });

  it("preserves standard punctuation and symbols", () => {
    expect(stripEmojis("C++ is #1 @ 100%")).toBe("C++ is #1 @ 100%");
  });

  it("removes number-style emojis like keycap sequences", () => {
    expect(stripEmojis("Step 1️⃣: Do something")).toBe("Step 1: Do something");
  });

  it("strips leading spaces left by emojis at line start", () => {
    expect(stripEmojis("🎬 Learn TypeScript")).toBe("Learn TypeScript");
  });

  it("strips trailing spaces left by emojis at line end", () => {
    expect(stripEmojis("Hello World 🎉")).toBe("Hello World");
  });

  it("handles empty string", () => {
    expect(stripEmojis("")).toBe("");
  });

  it("handles multiline descriptions with emojis", () => {
    const input = `🎬 Learn TypeScript generics in 10 minutes

0:00 Introduction
2:30 Basic generics

🔗 Links:
https://example.com

✨ Follow me on Twitter`;

    const output = stripEmojis(input);
    expect(output).not.toMatch(
      /[\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2728}\u{1F3AC}\u{1F517}]/u
    );
    expect(output).toContain("Learn TypeScript generics in 10 minutes");
    expect(output).toContain("0:00 Introduction");
    expect(output).toContain("https://example.com");
  });
});
