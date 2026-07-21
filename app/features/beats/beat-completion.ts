export const storageKey = (beatId: string) => `beat-completion:${beatId}`;

export function getBeatCompletion(beatId: string): boolean {
  try {
    return localStorage.getItem(storageKey(beatId)) === "true";
  } catch {
    return false;
  }
}

export function setBeatCompletion(beatId: string, completed: boolean): void {
  try {
    if (completed) {
      localStorage.setItem(storageKey(beatId), "true");
    } else {
      localStorage.removeItem(storageKey(beatId));
    }
  } catch {
    // localStorage unavailable
  }
}
