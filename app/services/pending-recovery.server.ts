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
  /**
   * How the root `course.json` receipt classifies this Pending Version.
   * `committed` — the receipt names it: Promote. `absent` — provably no
   * receipt for it (none exists, or an older publish's): offer Discard.
   * `unreadable` — the mount or receipt could not be read: refuse to
   * classify, offer nothing destructive.
   */
  receiptState: "committed" | "absent" | "unreadable";
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

    // Discard may only be offered on a PROVABLY absent receipt — a mount that
    // cannot be read proves nothing, and discarding a committed version is the
    // one unforgivable outcome. So an unreachable Dropbox root refuses to
    // classify rather than reading a missing file as "nothing landed".
    const rootExists = yield* effectFs
      .exists(dropboxPath)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));

    // The receipt committed iff the root course.json parses and names this
    // Pending Version (its `courseVersionId` field — the same id the sync
    // stamped into the manifest). A missing file or one naming an earlier
    // publish is a provably absent receipt: the crash preceded the rename.
    // Any other read failure — and garbage bytes, which the atomic rename
    // makes impossible for a real receipt — classifies as unreadable.
    const receiptState = !rootExists
      ? ("unreadable" as const)
      : yield* effectFs.readFileString(courseJsonPath).pipe(
          Effect.map((raw): PendingRecovery["receiptState"] => {
            try {
              const doc = JSON.parse(raw) as { courseVersionId?: unknown };
              return doc.courseVersionId === pending.id
                ? "committed"
                : "absent";
            } catch {
              return "unreadable";
            }
          }),
          Effect.catchAll((error) =>
            Effect.succeed<PendingRecovery["receiptState"]>(
              error._tag === "SystemError" && error.reason === "NotFound"
                ? "absent"
                : "unreadable"
            )
          )
        );

    return {
      versionId: pending.id,
      versionName: pending.name,
      receiptState,
    } satisfies PendingRecovery;
  }
);
