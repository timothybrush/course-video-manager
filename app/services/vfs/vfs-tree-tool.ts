import { lookupPath, type VfsDirNode } from "./vfs-tree";

const LINE_LIMIT = 400;

export const vfsTree = (
  root: VfsDirNode,
  absolutePath: string,
  depth?: number
): string => {
  const result = lookupPath(root, absolutePath);

  if (result.type === "not-found") {
    return `tree: ${absolutePath}: No such file or directory`;
  }

  if (result.type === "file") {
    return `tree: ${absolutePath}: Not a directory`;
  }

  const dir = result.node;
  const lines: string[] = [];
  let truncated = false;

  const dirName =
    dir.name || absolutePath.split("/").filter(Boolean).pop() || "/";
  const ghost = dir.ghost ? "   [ghost]" : "";
  lines.push(`${dirName}/${ghost}`);

  const addChildren = (
    node: VfsDirNode,
    prefix: string,
    currentDepth: number
  ) => {
    if (truncated) return;
    if (depth !== undefined && currentDepth >= depth) return;

    // Section/lesson directories carry an `order` derived from the database.
    // When both siblings have one, order by it so ghost entries (which carry
    // un-numbered paths) stay inline with real ones; otherwise fall back to
    // alphabetical (e.g. course.json vs sections/).
    const sorted = [...node.children.entries()].sort((a, b) => {
      const ao = a[1].kind === "dir" ? a[1].order : undefined;
      const bo = b[1].kind === "dir" ? b[1].order : undefined;
      if (ao !== undefined && bo !== undefined && ao !== bo) {
        return ao - bo;
      }
      return a[0].localeCompare(b[0]);
    });

    for (let i = 0; i < sorted.length; i++) {
      if (truncated) return;

      const [, child] = sorted[i]!;
      const isLast = i === sorted.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const nextPrefix = prefix + (isLast ? "    " : "│   ");

      if (child.kind === "dir") {
        const ghostTag = child.ghost ? "   [ghost]" : "";
        lines.push(`${prefix}${connector}${child.name}/${ghostTag}`);

        if (lines.length >= LINE_LIMIT) {
          truncated = true;
          return;
        }

        addChildren(child, nextPrefix, currentDepth + 1);
      } else {
        lines.push(`${prefix}${connector}${child.name}`);

        if (lines.length >= LINE_LIMIT) {
          truncated = true;
          return;
        }
      }
    }
  };

  addChildren(dir, "", 0);

  if (truncated) {
    lines.push("\n[output truncated at ~400 lines]");
  }

  return lines.join("\n");
};
