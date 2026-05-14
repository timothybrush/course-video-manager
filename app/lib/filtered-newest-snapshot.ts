import { isVisibleInTimeline } from "./timeline-visibility";

export function filteredNewestSnapshot(
  snapshots: {
    id: string;
    preserved: boolean;
    createdAt: Date;
    clips: { archived: boolean }[];
  }[]
): string | null {
  let newest: { id: string; createdAt: Date } | null = null;

  for (const s of snapshots) {
    if (!isVisibleInTimeline(s, s.clips)) continue;
    if (!newest || s.createdAt > newest.createdAt) {
      newest = s;
    }
  }

  return newest?.id ?? null;
}
