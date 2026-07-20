export function shouldIgnoreKeyboardShortcut(e: KeyboardEvent): boolean {
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement ||
    (e.target instanceof HTMLButtonElement &&
      !e.target.classList.contains("allow-keydown"))
  ) {
    return true;
  }

  const target = e.target as Element | null;
  if (target?.closest?.('[role="dialog"]')) {
    return true;
  }

  return false;
}
