import { Console, Effect } from "effect";
import { data } from "react-router";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import { filteredNewestSnapshot } from "@/lib/filtered-newest-snapshot";

export const loadDiagramPlaygroundActive = async () => {
  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const [diagrams, allSnapshots] = yield* Effect.all(
      [db.listDiagrams(), db.listAllSnapshotsWithClips()],
      { concurrency: "unbounded" }
    );

    const snapshotsByDiagram = new Map<
      string,
      {
        id: string;
        contentHash: string;
        preserved: boolean;
        createdAt: Date;
        clips: { archived: boolean }[];
      }[]
    >();
    for (const s of allSnapshots) {
      let arr = snapshotsByDiagram.get(s.diagramId);
      if (!arr) {
        arr = [];
        snapshotsByDiagram.set(s.diagramId, arr);
      }
      arr.push(s);
    }

    return data({
      diagrams: diagrams.map((d) => {
        const snapshots = snapshotsByDiagram.get(d.id) ?? [];
        const newestId = filteredNewestSnapshot(snapshots);
        const newestSnapshot = newestId
          ? snapshots.find((s) => s.id === newestId)
          : null;
        return {
          id: d.id,
          name: d.name,
          thumbnailContentHash: newestSnapshot?.contentHash ?? null,
        };
      }),
    });
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchAll(() =>
      Effect.die(data("Internal server error", { status: 500 }))
    ),
    runtimeLive.runPromise
  );
};
