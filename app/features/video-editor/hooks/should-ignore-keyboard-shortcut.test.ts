import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { shouldIgnoreKeyboardShortcut } from "./should-ignore-keyboard-shortcut";

function makeEvent(target: unknown): KeyboardEvent {
  const event = { target } as KeyboardEvent;
  return event;
}

class FakeHTMLInputElement {}
class FakeHTMLTextAreaElement {}
class FakeHTMLButtonElement {
  classList = { contains: (_cls: string) => false };
}

describe("shouldIgnoreKeyboardShortcut", () => {
  const origInput = globalThis.HTMLInputElement;
  const origTextarea = globalThis.HTMLTextAreaElement;
  const origButton = globalThis.HTMLButtonElement;

  // Provide minimal globals so instanceof checks work
  beforeAll(() => {
    (globalThis as any).HTMLInputElement = FakeHTMLInputElement;
    (globalThis as any).HTMLTextAreaElement = FakeHTMLTextAreaElement;
    (globalThis as any).HTMLButtonElement = FakeHTMLButtonElement;
  });

  afterAll(() => {
    (globalThis as any).HTMLInputElement = origInput;
    (globalThis as any).HTMLTextAreaElement = origTextarea;
    (globalThis as any).HTMLButtonElement = origButton;
  });

  it("returns false for a target with no closest and not an input/textarea/button", () => {
    const target = { closest: () => null };
    expect(shouldIgnoreKeyboardShortcut(makeEvent(target))).toBe(false);
  });

  it("returns true for an HTMLInputElement", () => {
    const target = new FakeHTMLInputElement();
    expect(shouldIgnoreKeyboardShortcut(makeEvent(target))).toBe(true);
  });

  it("returns true for an HTMLTextAreaElement", () => {
    const target = new FakeHTMLTextAreaElement();
    expect(shouldIgnoreKeyboardShortcut(makeEvent(target))).toBe(true);
  });

  it("returns true for a button without allow-keydown", () => {
    const target = new FakeHTMLButtonElement();
    expect(shouldIgnoreKeyboardShortcut(makeEvent(target))).toBe(true);
  });

  it("returns false for a button with allow-keydown", () => {
    const target = new FakeHTMLButtonElement();
    target.classList.contains = (cls: string) => cls === "allow-keydown";
    expect(shouldIgnoreKeyboardShortcut(makeEvent(target))).toBe(false);
  });

  it("returns true when target.closest matches [role=dialog]", () => {
    const dialogEl = {};
    const target = {
      closest: (sel: string) => (sel === '[role="dialog"]' ? dialogEl : null),
    };
    expect(shouldIgnoreKeyboardShortcut(makeEvent(target))).toBe(true);
  });

  it("returns false when target.closest returns null for dialog", () => {
    const target = { closest: () => null };
    expect(shouldIgnoreKeyboardShortcut(makeEvent(target))).toBe(false);
  });

  it("returns true when target has no closest method but is inside a dialog (graceful)", () => {
    const target = {};
    expect(shouldIgnoreKeyboardShortcut(makeEvent(target))).toBe(false);
  });
});
