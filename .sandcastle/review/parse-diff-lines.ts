export function parseDiffLines(diff: string): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>();
  const lines = diff.split("\n");

  let currentPath: string | null = null;
  let rightLine = 0;

  for (const line of lines) {
    const fileMatch = line.match(/^diff --git a\/.+ b\/(.+)$/);
    if (fileMatch) {
      currentPath = fileMatch[1]!;
      if (!result.has(currentPath)) {
        result.set(currentPath, new Set());
      }
      continue;
    }

    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      rightLine = parseInt(hunkMatch[1]!, 10);
      continue;
    }

    if (!currentPath) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      result.get(currentPath)!.add(rightLine);
      rightLine++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      // Removed line — only on left side, don't increment right counter.
    } else if (line.startsWith(" ")) {
      result.get(currentPath)!.add(rightLine);
      rightLine++;
    }
  }

  return result;
}
