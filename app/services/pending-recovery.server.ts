import { Config, Effect } from "effect";
import { FileSystem } from "@effect/platform";
import path from "node:path";
import { VersionOperationsService } from "./db-version-operations.server";

/**
 * Reconcile-on-load for a crash-stranded Pending Version (issues #1350/#1404).
 *
 * A Pending Version found at rest means exactly one thing: the process died
 * between the Dropbox `course.json` rename (the commit receipt) and the
 * Promote DB write — caught Commit failures auto-Discard (#1401), so nothing
 * else leaves one behind. This classifier is the read-only half of the
 * recovery surface: the publish-page loader calls it, and the state
 * transitions (Promote when the receipt committed, operator-clicked Discard
 * when it did not) run in the route action. Never Discard a committed
 * version — the external receipt is the truth, and consumers may already be
 * importing it.
 */
export type PendingRecovery = {
  versionId: string;
  versionName: string;
  /** Whether the root `course.json` receipt names this Pending Version. */
  receiptCommitted: boolean;
};

export const classifyPendingRecovery = Effect.fn("classifyPendingRecovery")(
  function* (input: { courseId: string; courseName: string }) {
    const versionOps = yield* VersionOperationsService;
    const pending = yield* versionOps.getPendingVersion(input.courseId);
    if (!pending) return null;

    const effectFs = yield* FileSystem.FileSystem;
    const dropboxPath = yield* Config.string("DROPBOX_PATH");
    const courseJsonPath = path.join(
      dropboxPath,
      input.courseName,
      "course.json"
    );

    // The receipt committed iff the root course.json exists, parses, and names
    // this Pending Version (its `courseVersionId` field — the same id the sync
    // stamped into the manifest). Missing, unreadable, or naming another
    // version all mean the crash happened before the rename: nothing landed.
    const receiptVersionId = yield* effectFs
      .readFileString(courseJsonPath)
      .pipe(
        Effect.map((raw): string | null => {
          try {
            const doc = JSON.parse(raw) as { courseVersionId?: unknown };
            return typeof doc.courseVersionId === "string"
              ? doc.courseVersionId
              : null;
          } catch {
            return null;
          }
        }),
        Effect.catchAll(() => Effect.succeed<string | null>(null))
      );

    return {
      versionId: pending.id,
      versionName: pending.name,
      receiptCommitted: receiptVersionId === pending.id,
    } satisfies PendingRecovery;
  }
);
