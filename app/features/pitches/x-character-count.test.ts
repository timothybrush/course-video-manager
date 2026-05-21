import { describe, it, expect } from "vitest";
import {
  X_POST_CHARACTER_LIMIT,
  isOverXCharacterLimit,
} from "./x-character-count";

describe("x-character-count", () => {
  it("has a limit of 280 characters", () => {
    expect(X_POST_CHARACTER_LIMIT).toBe(280);
  });

  it("returns false when text is under the limit", () => {
    expect(isOverXCharacterLimit("hello")).toBe(false);
  });

  it("returns false when text is exactly at the limit", () => {
    expect(isOverXCharacterLimit("a".repeat(280))).toBe(false);
  });

  it("returns true when text is over the limit", () => {
    expect(isOverXCharacterLimit("a".repeat(281))).toBe(true);
  });

  it("returns false for empty text", () => {
    expect(isOverXCharacterLimit("")).toBe(false);
  });
});
