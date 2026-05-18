import { describe, expect, it } from "vitest";
import {
  groupDeliverables,
  type DeliverableForGrouping,
} from "./deliverable-grouping";

const today = new Date(2026, 4, 18); // 2026-05-18, Monday, ISO week 21

function makeDeliverable(
  overrides: Partial<DeliverableForGrouping> &
    Pick<DeliverableForGrouping, "date">
): DeliverableForGrouping {
  const { date, ...rest } = overrides;
  return {
    id: crypto.randomUUID(),
    title: "Test",
    notes: null,
    date,
    status: "planned",
    archived: false,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    ...rest,
  };
}

describe("groupDeliverables", () => {
  it("returns current week even when no items exist", () => {
    const result = groupDeliverables([], today);
    expect(result.weekGroups).toHaveLength(1);
    expect(result.weekGroups[0]!.week).toBe(21);
    expect(result.weekGroups[0]!.year).toBe(2026);
    expect(result.weekGroups[0]!.items).toEqual([]);
  });

  it("groups items into correct weeks", () => {
    const items = [
      makeDeliverable({ date: "2026-05-19", title: "A" }),
      makeDeliverable({ date: "2026-05-26", title: "B" }),
    ];
    const result = groupDeliverables(items, today);
    expect(result.weekGroups).toHaveLength(2);
    expect(result.weekGroups[0]!.week).toBe(21);
    expect(result.weekGroups[0]!.items).toHaveLength(1);
    expect(result.weekGroups[0]!.items[0]!.title).toBe("A");
    expect(result.weekGroups[1]!.week).toBe(22);
    expect(result.weekGroups[1]!.items).toHaveLength(1);
    expect(result.weekGroups[1]!.items[0]!.title).toBe("B");
  });

  it("sorts items within a week by date asc, then createdAt asc", () => {
    const items = [
      makeDeliverable({
        date: "2026-05-21",
        title: "Later date",
        createdAt: new Date("2026-05-01T00:00:00Z"),
      }),
      makeDeliverable({
        date: "2026-05-19",
        title: "Earlier date",
        createdAt: new Date("2026-05-02T00:00:00Z"),
      }),
      makeDeliverable({
        date: "2026-05-19",
        title: "Same date, earlier created",
        createdAt: new Date("2026-05-01T00:00:00Z"),
      }),
    ];
    const result = groupDeliverables(items, today);
    expect(result.weekGroups[0]!.items.map((i) => i.title)).toEqual([
      "Same date, earlier created",
      "Earlier date",
      "Later date",
    ]);
  });

  it("sorts week groups by year-week ascending", () => {
    const items = [
      makeDeliverable({ date: "2026-06-01", title: "Week 23" }),
      makeDeliverable({ date: "2026-05-19", title: "Week 21" }),
      makeDeliverable({ date: "2026-05-25", title: "Week 22" }),
    ];
    const result = groupDeliverables(items, today);
    expect(result.weekGroups.map((g) => g.week)).toEqual([21, 22, 23]);
  });

  it("filters out archived items", () => {
    const items = [
      makeDeliverable({
        date: "2026-05-19",
        title: "Visible",
        archived: false,
      }),
      makeDeliverable({
        date: "2026-05-20",
        title: "Archived",
        archived: true,
      }),
    ];
    const result = groupDeliverables(items, today);
    const allItems = result.weekGroups.flatMap((g) => g.items);
    expect(allItems).toHaveLength(1);
    expect(allItems[0]!.title).toBe("Visible");
  });

  it("includes current week even when all items are in other weeks", () => {
    const items = [makeDeliverable({ date: "2026-06-01", title: "Future" })];
    const result = groupDeliverables(items, today);
    expect(result.weekGroups[0]!.week).toBe(21);
    expect(result.weekGroups[0]!.items).toEqual([]);
    expect(result.weekGroups[1]!.week).toBe(23);
  });

  it("handles multiple items on the same day sorted by createdAt", () => {
    const items = [
      makeDeliverable({
        date: "2026-05-20",
        title: "Second created",
        createdAt: new Date("2026-05-10T12:00:00Z"),
      }),
      makeDeliverable({
        date: "2026-05-20",
        title: "First created",
        createdAt: new Date("2026-05-10T08:00:00Z"),
      }),
    ];
    const result = groupDeliverables(items, today);
    expect(result.weekGroups[0]!.items.map((i) => i.title)).toEqual([
      "First created",
      "Second created",
    ]);
  });

  it("returns only current week when all items are archived", () => {
    const items = [
      makeDeliverable({
        date: "2026-05-19",
        title: "Archived A",
        archived: true,
      }),
      makeDeliverable({
        date: "2026-05-26",
        title: "Archived B",
        archived: true,
      }),
    ];
    const result = groupDeliverables(items, today);
    expect(result.weekGroups).toHaveLength(1);
    expect(result.weekGroups[0]!.week).toBe(21);
    expect(result.weekGroups[0]!.items).toEqual([]);
  });

  it("groups correctly across year boundary where ISO year differs from calendar year", () => {
    const yearEnd = new Date(2025, 11, 29); // 2025-12-29, ISO week 1 of 2026
    const items = [
      makeDeliverable({ date: "2025-12-28", title: "Week 52 of 2025" }),
      makeDeliverable({ date: "2025-12-29", title: "Week 1 of 2026" }),
      makeDeliverable({ date: "2026-01-02", title: "Also week 1 of 2026" }),
    ];
    const result = groupDeliverables(items, yearEnd);
    expect(result.weekGroups).toHaveLength(2);
    expect(result.weekGroups[0]!.year).toBe(2025);
    expect(result.weekGroups[0]!.week).toBe(52);
    expect(result.weekGroups[0]!.items[0]!.title).toBe("Week 52 of 2025");
    expect(result.weekGroups[1]!.year).toBe(2026);
    expect(result.weekGroups[1]!.week).toBe(1);
    expect(result.weekGroups[1]!.items.map((i) => i.title)).toEqual([
      "Week 1 of 2026",
      "Also week 1 of 2026",
    ]);
  });

  it("handles items in past weeks", () => {
    const items = [
      makeDeliverable({ date: "2026-05-11", title: "Past week 20" }),
      makeDeliverable({ date: "2026-05-19", title: "This week 21" }),
    ];
    const result = groupDeliverables(items, today);
    expect(result.weekGroups.map((g) => g.week)).toEqual([20, 21]);
    expect(result.weekGroups[0]!.items[0]!.title).toBe("Past week 20");
    expect(result.weekGroups[1]!.items[0]!.title).toBe("This week 21");
  });
});
