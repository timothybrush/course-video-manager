import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getBeatCompletion,
  setBeatCompletion,
  storageKey,
} from "./beat-completion";

const fakeStorage = new Map<string, string>();

beforeEach(() => {
  fakeStorage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => fakeStorage.get(key) ?? null,
    setItem: (key: string, value: string) => fakeStorage.set(key, value),
    removeItem: (key: string) => fakeStorage.delete(key),
  });
});

describe("storageKey", () => {
  it("includes the beat ID", () => {
    expect(storageKey("abc-123")).toBe("beat-completion:abc-123");
  });
});

describe("getBeatCompletion", () => {
  it("returns false when nothing is stored", () => {
    expect(getBeatCompletion("b1")).toBe(false);
  });

  it('returns true when "true" is stored', () => {
    fakeStorage.set(storageKey("b1"), "true");
    expect(getBeatCompletion("b1")).toBe(true);
  });

  it("returns false for any other stored value", () => {
    fakeStorage.set(storageKey("b1"), "false");
    expect(getBeatCompletion("b1")).toBe(false);
  });
});

describe("setBeatCompletion", () => {
  it("stores true", () => {
    setBeatCompletion("b1", true);
    expect(fakeStorage.get(storageKey("b1"))).toBe("true");
  });

  it("removes the key when set to false", () => {
    fakeStorage.set(storageKey("b1"), "true");
    setBeatCompletion("b1", false);
    expect(fakeStorage.has(storageKey("b1"))).toBe(false);
  });
});
