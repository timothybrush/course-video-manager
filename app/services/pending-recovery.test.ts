/**
 * Reconcile-on-load classification for a crash-stranded Pending Version
 * (issues #1350/#1404). The classifier correlates the course's Pending row
 * (at most one, by the partial unique index) against the root Dropbox
 * `course.json` receipt: the receipt naming the Pending Version means the
 * publish committed (→ Promote); anything else means the crash preceded the
 * atomic rename (→ offer Discard). The transitions themselves
 * (promote/discard) are covered in version-lifecycle.test.ts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import { NodeContext } from "@effect/platform-node";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createTestDb,
  truncateAllTables,
  type TestDb,
} from "@/test-utils/pglite";
import { CourseOperationsService } from "@/services/db-course-operations.server";
import { VersionOperationsService } from "@/services/db-version-operations.server";
import { LessonSectionOperationsService } from "@/services/db-lesson-section-operations.server";
import { DrizzleService } from "@/services/drizzle-service.server";
import { classifyPendingRecovery } from "@/services/pending-recovery.server";

let testDb: TestDb;
let dropboxDir: string;

beforeAll(async () => {
  const result = await createTestDb();
  testDb = result.testDb;
  dropboxDir = await fs.mkdtemp(path.join(os.tmpdir(), "cvm-recovery-"));
});

const COURSE_NAME = "recovery-course";

const setup = async () => {
  await truncateAllTables(testDb);
  await fs.rm(path.join(dropboxDir, COURSE_NAME), {
    recursive: true,
    force: true,
  });
  await fs.mkdir(path.join(dropboxDir, COURSE_NAME), { recursive: true });

  const drizzleLayer = Layer.succeed(DrizzleService, testDb as any);
  const dbLayer = Layer.mergeAll(
    CourseOperationsService.Default,
    VersionOperationsService.Default,
    LessonSectionOperationsService.Default
  ).pipe(Layer.provide(drizzleLayer), Layer.merge(NodeContext.layer));

  const run = <A, E>(effect: Effect.Effect<A, E, any>) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provide(dbLayer),
        Effect.withConfigProvider(
          ConfigProvider.fromMap(new Map([["DROPBOX_PATH", dropboxDir]]))
        )
      ) as Effect.Effect<A, E, never>
    ) as Promise<A>;

  const seeded = await run(
    Effect.gen(function* () {
      const courseOps = yield* CourseOperationsService;
      const versionOps = yield* VersionOperationsService;
      const course = yield* courseOps.createCourse({ name: COURSE_NAME });
      const version = yield* versionOps.createCourseVersion({
        repoId: course.id,
        name: "",
      });
      return { course, version };
    })
  );

  // Submit: freeze the Draft as a Pending Version — the state a crash between
  // the receipt rename and Promote leaves at rest.
  const submit = () =>
    run(
      Effect.gen(function* () {
        const versionOps = yield* VersionOperationsService;
        return yield* versionOps.freezeAndCloneVersion({
          sourceVersionId: seeded.version.id,
          repoId: seeded.course.id,
          newVersionName: "",
          sourceName: "v1.0.0",
          sourceDescription: "First release",
        });
      })
    );

  const classify = () =>
    run(
      classifyPendingRecovery({
        courseId: seeded.course.id,
        courseName: COURSE_NAME,
      })
    );

  const writeReceipt = (contents: string) =>
    fs.writeFile(path.join(dropboxDir, COURSE_NAME, "course.json"), contents);

  return { ...seeded, run, submit, classify, writeReceipt };
};

describe("classifyPendingRecovery (#1404)", () => {
  it("returns null when the course has no Pending Version", async () => {
    const { classify } = await setup();
    expect(await classify()).toBeNull();
  });

  it("classifies a Pending with no receipt as provably absent", async () => {
    const { submit, classify, version } = await setup();
    await submit();
    expect(await classify()).toEqual({
      versionId: version.id,
      versionName: "v1.0.0",
      receiptState: "absent",
    });
  });

  it("classifies a Pending whose receipt names it as committed", async () => {
    const { submit, classify, writeReceipt, version } = await setup();
    await submit();
    await writeReceipt(JSON.stringify({ courseVersionId: version.id }));
    expect(await classify()).toEqual({
      versionId: version.id,
      versionName: "v1.0.0",
      receiptState: "committed",
    });
  });

  it("a receipt naming an earlier version is absent for this Pending", async () => {
    const { submit, classify, writeReceipt } = await setup();
    await submit();
    await writeReceipt(JSON.stringify({ courseVersionId: "some-older-id" }));
    expect((await classify())?.receiptState).toBe("absent");
  });

  // Discard may only be offered on a PROVABLY absent receipt: anything we
  // could not actually read refuses to classify, so a down mount can never
  // lead to discarding a version whose receipt in fact committed.
  it("an unparseable receipt refuses to classify (unreadable)", async () => {
    const { submit, classify, writeReceipt } = await setup();
    await submit();
    await writeReceipt("{ not json");
    expect((await classify())?.receiptState).toBe("unreadable");
  });

  it("a missing Dropbox root refuses to classify (unreadable)", async () => {
    const { submit, run, course } = await setup();
    await submit();
    const result = await run(
      classifyPendingRecovery({
        courseId: course.id,
        courseName: COURSE_NAME,
      }).pipe(
        // Innermost provider wins: simulate the whole mount being absent.
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([["DROPBOX_PATH", path.join(dropboxDir, "no-such-mount")]])
          )
        )
      )
    );
    expect(result?.receiptState).toBe("unreadable");
  });
});
