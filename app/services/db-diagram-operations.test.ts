import { describe, it, expect } from "@effect/vitest";
import { beforeAll, beforeEach } from "vitest";
import { Effect, Layer } from "effect";
import { DBFunctionsService } from "@/services/db-service.server";
import { DrizzleService } from "@/services/drizzle-service.server";
import {
  createTestDb,
  truncateAllTables,
  type TestDb,
} from "@/test-utils/pglite";

let testDb: TestDb;
let testLayer: Layer.Layer<DBFunctionsService>;

beforeAll(async () => {
  const result = await createTestDb();
  testDb = result.testDb;

  testLayer = DBFunctionsService.Default.pipe(
    Layer.provide(Layer.succeed(DrizzleService, testDb as any))
  );
});

beforeEach(async () => {
  await truncateAllTables(testDb);
});

describe("createDiagram", () => {
  it.effect("creates a diagram with name Untitled 1 by default", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const diagram = yield* db.createDiagram();

      expect(diagram.id).toEqual(expect.any(String));
      expect(diagram.name).toBe("Untitled 1");
      expect(diagram.headScene).toBeNull();
      expect(diagram.archived).toBe(false);
      expect(diagram.createdAt).toBeInstanceOf(Date);
      expect(diagram.updatedAt).toBeInstanceOf(Date);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("auto-increments Untitled N avoiding used numbers", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const d1 = yield* db.createDiagram();
      expect(d1.name).toBe("Untitled 1");

      const d2 = yield* db.createDiagram();
      expect(d2.name).toBe("Untitled 2");

      const d3 = yield* db.createDiagram();
      expect(d3.name).toBe("Untitled 3");
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("fills gaps in Untitled N numbering", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const d1 = yield* db.createDiagram();
      yield* db.createDiagram();
      yield* db.createDiagram();

      yield* db.updateDiagram(d1.id, { name: "My Diagram" });

      const d4 = yield* db.createDiagram();
      expect(d4.name).toBe("Untitled 1");
    }).pipe(Effect.provide(testLayer))
  );

  it.effect(
    "does not count non-matching names toward Untitled N numbering",
    () =>
      Effect.gen(function* () {
        const db = yield* DBFunctionsService;
        const d1 = yield* db.createDiagram();
        yield* db.updateDiagram(d1.id, { name: "Custom Name" });

        const d2 = yield* db.createDiagram();
        expect(d2.name).toBe("Untitled 1");
      }).pipe(Effect.provide(testLayer))
  );

  it.effect("does not count archived Untitled N names toward numbering", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const d1 = yield* db.createDiagram();
      expect(d1.name).toBe("Untitled 1");

      yield* db.updateDiagram(d1.id, { archived: true });

      const d2 = yield* db.createDiagram();
      expect(d2.name).toBe("Untitled 1");
    }).pipe(Effect.provide(testLayer))
  );
});

describe("listDiagrams", () => {
  it.effect("returns non-archived diagrams sorted by updatedAt desc", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;

      const d1 = yield* db.createDiagram();
      const d2 = yield* db.createDiagram();

      // Force d1.updatedAt to be clearly newer
      yield* Effect.promise(() => new Promise((r) => setTimeout(r, 50)));
      yield* db.updateDiagram(d1.id, { name: "Updated Last" });

      const list = yield* db.listDiagrams();
      expect(list).toHaveLength(2);
      expect(list[0]!.id).toBe(d1.id);
      expect(list[1]!.id).toBe(d2.id);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("excludes archived diagrams by default", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;

      yield* db.createDiagram();
      const d2 = yield* db.createDiagram();
      yield* db.updateDiagram(d2.id, { archived: true });

      const list = yield* db.listDiagrams();
      expect(list).toHaveLength(1);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("includes archived diagrams when requested", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;

      yield* db.createDiagram();
      const d2 = yield* db.createDiagram();
      yield* db.updateDiagram(d2.id, { archived: true });

      const list = yield* db.listDiagrams({ includeArchived: true });
      expect(list).toHaveLength(2);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("filters by name substring case-insensitively", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;

      const d1 = yield* db.createDiagram();
      yield* db.updateDiagram(d1.id, { name: "Architecture Overview" });

      const d2 = yield* db.createDiagram();
      yield* db.updateDiagram(d2.id, { name: "Data Flow" });

      const d3 = yield* db.createDiagram();
      yield* db.updateDiagram(d3.id, { name: "architecture detail" });

      const list = yield* db.listDiagrams({ nameFilter: "architecture" });
      expect(list).toHaveLength(2);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("returns empty array when no diagrams exist", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const list = yield* db.listDiagrams();
      expect(list).toEqual([]);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect(
    "filters by name among archived diagrams when includeArchived is true",
    () =>
      Effect.gen(function* () {
        const db = yield* DBFunctionsService;

        const d1 = yield* db.createDiagram();
        yield* db.updateDiagram(d1.id, { name: "Architecture Overview" });

        const d2 = yield* db.createDiagram();
        yield* db.updateDiagram(d2.id, {
          name: "Architecture Detail",
          archived: true,
        });

        const d3 = yield* db.createDiagram();
        yield* db.updateDiagram(d3.id, { name: "Data Flow" });

        const withArchived = yield* db.listDiagrams({
          nameFilter: "architecture",
          includeArchived: true,
        });
        expect(withArchived).toHaveLength(2);

        const withoutArchived = yield* db.listDiagrams({
          nameFilter: "architecture",
          includeArchived: false,
        });
        expect(withoutArchived).toHaveLength(1);
        expect(withoutArchived[0]!.name).toBe("Architecture Overview");
      }).pipe(Effect.provide(testLayer))
  );

  it.effect("returns no results when filter matches nothing", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      yield* db.createDiagram();

      const list = yield* db.listDiagrams({ nameFilter: "nonexistent" });
      expect(list).toEqual([]);
    }).pipe(Effect.provide(testLayer))
  );
});

describe("getDiagram", () => {
  it.effect("returns a diagram by id", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const created = yield* db.createDiagram();
      const fetched = yield* db.getDiagram(created.id);

      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe(created.name);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("fails with NotFoundError for missing id", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const result = yield* db.getDiagram("nonexistent-id").pipe(Effect.flip);

      expect(result._tag).toBe("NotFoundError");
    }).pipe(Effect.provide(testLayer))
  );
});

describe("updateDiagram", () => {
  it.effect("renames a diagram and bumps updatedAt", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const created = yield* db.createDiagram();
      const originalUpdatedAt = created.updatedAt;

      const updated = yield* db.updateDiagram(created.id, {
        name: "New Name",
      });

      expect(updated.name).toBe("New Name");
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt.getTime()
      );
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("archives a diagram", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const created = yield* db.createDiagram();

      const updated = yield* db.updateDiagram(created.id, { archived: true });
      expect(updated.archived).toBe(true);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("unarchives a diagram", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const created = yield* db.createDiagram();
      yield* db.updateDiagram(created.id, { archived: true });

      const updated = yield* db.updateDiagram(created.id, { archived: false });
      expect(updated.archived).toBe(false);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("fails with NotFoundError for non-existent diagram", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const result = yield* db
        .updateDiagram("nonexistent-id", { name: "Nope" })
        .pipe(Effect.flip);
      expect(result._tag).toBe("NotFoundError");
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("updating name does not change archived", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const created = yield* db.createDiagram();

      const updated = yield* db.updateDiagram(created.id, {
        name: "New Name",
      });
      expect(updated.name).toBe("New Name");
      expect(updated.archived).toBe(false);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("empty fields object still bumps updatedAt", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const created = yield* db.createDiagram();

      yield* Effect.promise(() => new Promise((r) => setTimeout(r, 50)));
      const updated = yield* db.updateDiagram(created.id, {});

      expect(updated.name).toBe(created.name);
      expect(updated.archived).toBe(created.archived);
      expect(updated.updatedAt.getTime()).toBeGreaterThan(
        created.updatedAt.getTime()
      );
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("allows setting name and archived in a single update", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const created = yield* db.createDiagram();

      const updated = yield* db.updateDiagram(created.id, {
        name: "Archived Diagram",
        archived: true,
      });
      expect(updated.name).toBe("Archived Diagram");
      expect(updated.archived).toBe(true);
    }).pipe(Effect.provide(testLayer))
  );
});

describe("updateDiagramHead", () => {
  it.effect("stores headScene and bumps updatedAt", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const created = yield* db.createDiagram();
      expect(created.headScene).toBeNull();

      const scene = {
        store: { "shape:abc": { id: "shape:abc" } },
        schema: { schemaVersion: 2 },
      };
      const updated = yield* db.updateDiagramHead(created.id, scene);

      expect(updated.headScene).toEqual(scene);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        created.updatedAt.getTime()
      );
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("overwrites previous headScene", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const created = yield* db.createDiagram();

      const scene1 = { store: { "shape:a": {} }, schema: { schemaVersion: 2 } };
      yield* db.updateDiagramHead(created.id, scene1);

      const scene2 = { store: { "shape:b": {} }, schema: { schemaVersion: 2 } };
      const updated = yield* db.updateDiagramHead(created.id, scene2);

      expect(updated.headScene).toEqual(scene2);
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("fails with NotFoundError for non-existent diagram", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const result = yield* db
        .updateDiagramHead("nonexistent-id", { store: {} })
        .pipe(Effect.flip);
      expect(result._tag).toBe("NotFoundError");
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("preserves name and archived when updating head", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const created = yield* db.createDiagram();
      yield* db.updateDiagram(created.id, {
        name: "My Diagram",
        archived: false,
      });

      const scene = { store: { "shape:x": {} } };
      const updated = yield* db.updateDiagramHead(created.id, scene);

      expect(updated.name).toBe("My Diagram");
      expect(updated.archived).toBe(false);
      expect(updated.headScene).toEqual(scene);
    }).pipe(Effect.provide(testLayer))
  );
});
