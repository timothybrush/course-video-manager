import { isoWeek } from "./iso-week";

export interface DeliverableForGrouping {
  id: string;
  title: string;
  notes: string | null;
  date: string; // YYYY-MM-DD
  status: "planned" | "done" | "cancelled";
  archived: boolean;
  createdAt: Date;
}

export interface WeekGroup<
  T extends DeliverableForGrouping = DeliverableForGrouping,
> {
  week: number;
  year: number;
  items: T[];
  overdueCount: number;
}

export interface GroupedDeliverables<
  T extends DeliverableForGrouping = DeliverableForGrouping,
> {
  pastHistory: T[];
  weekGroups: WeekGroup<T>[];
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function groupDeliverables<T extends DeliverableForGrouping>(
  deliverables: T[],
  today: Date
): GroupedDeliverables<T> {
  const active = deliverables.filter((d) => !d.archived);
  const todayStr = formatDate(today);

  const pastHistory: T[] = [];
  const inline: T[] = [];

  for (const d of active) {
    const isPast = d.date < todayStr;
    if (isPast && (d.status === "done" || d.status === "cancelled")) {
      pastHistory.push(d);
    } else {
      inline.push(d);
    }
  }

  pastHistory.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const sorted = [...inline].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const todayWeek = isoWeek(today);
  const weekKey = (w: number, y: number) =>
    `${y}-${String(w).padStart(2, "0")}`;

  const byWeek = new Map<string, WeekGroup<T>>();

  const todayKey = weekKey(todayWeek.week, todayWeek.year);
  byWeek.set(todayKey, {
    week: todayWeek.week,
    year: todayWeek.year,
    items: [] as T[],
    overdueCount: 0,
  });

  for (const d of sorted) {
    const { week, year } = isoWeek(parseDate(d.date));
    const key = weekKey(week, year);
    let group = byWeek.get(key);
    if (!group) {
      group = { week, year, items: [] as T[], overdueCount: 0 };
      byWeek.set(key, group);
    }
    group.items.push(d);
    if (d.status === "planned" && d.date < todayStr) {
      group.overdueCount++;
    }
  }

  const weekGroups = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => group);

  return { pastHistory, weekGroups };
}
