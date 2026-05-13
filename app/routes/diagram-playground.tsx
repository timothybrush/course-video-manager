import { useEffect, useRef, useCallback, useState } from "react";
import { Tldraw, getSnapshot, loadSnapshot, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { toast } from "sonner";
import {
  subscribeChild,
  sendToParent,
  type ParentToChildMessage,
} from "@/lib/diagram-protocol";
import { isVisibleInTimeline } from "@/lib/timeline-visibility";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const DEBOUNCE_MS = 500;

interface Snapshot {
  id: string;
  diagramId: string;
  scene: unknown;
  contentHash: string;
  preserved: boolean;
  createdAt: string;
}

function TimelinePanel({
  diagramId,
  onRestore,
  refreshKey,
}: {
  diagramId: string;
  onRestore: (scene: unknown) => void;
  refreshKey: number;
}) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/diagrams/${diagramId}/snapshots/list`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const visible = (data.snapshots as Snapshot[]).filter((s) =>
          isVisibleInTimeline(s, [])
        );
        setSnapshots(visible);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [diagramId, refreshKey]);

  const handleRestore = async (snapshot: Snapshot) => {
    setRestoringId(snapshot.id);
    try {
      const res = await fetch(`/api/diagrams/${diagramId}/restore-to-head`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: snapshot.id }),
      });

      if (!res.ok) {
        toast.error("Failed to restore snapshot");
        return;
      }

      onRestore(snapshot.scene);
      toast.success("Restored to head");
    } catch {
      toast.error("Failed to restore snapshot");
    } finally {
      setRestoringId(null);
    }
  };

  if (loading) {
    return <div className="p-3 text-xs text-zinc-400">Loading snapshots…</div>;
  }

  if (snapshots.length === 0) {
    return <div className="p-3 text-xs text-zinc-400">No snapshots yet</div>;
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {snapshots.map((snapshot) => (
        <div
          key={snapshot.id}
          className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5"
        >
          <div className="h-8 w-10 shrink-0 rounded bg-zinc-700" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              {snapshot.preserved && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                  Preserved
                </Badge>
              )}
              <span className="text-[10px] text-zinc-400 truncate">
                {new Date(snapshot.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-zinc-300 hover:text-zinc-100"
            disabled={restoringId === snapshot.id}
            onClick={() => handleRestore(snapshot)}
          >
            {restoringId === snapshot.id ? "Restoring…" : "Restore"}
          </Button>
        </div>
      ))}
    </div>
  );
}

export default function DiagramPlayground() {
  const editorRef = useRef<Editor | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDiagramId = useRef<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [activeDiagramIdState, setActiveDiagramIdState] = useState<
    string | null
  >(null);
  const [preserving, setPreserving] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const saveHead = useCallback(async () => {
    const ed = editorRef.current;
    const id = activeDiagramId.current;
    if (!ed || !id) return;
    const { document } = getSnapshot(ed.store);
    try {
      await fetch(`/api/diagrams/${id}/head`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(document),
      });
    } catch {
      // Network errors during autosave are non-fatal
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveHead(), DEBOUNCE_MS);
  }, [saveHead]);

  const loadDiagram = useCallback(
    async (diagramId: string) => {
      const ed = editorRef.current;
      if (!ed) return;

      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (activeDiagramId.current) {
        await saveHead();
      }

      activeDiagramId.current = diagramId;
      setActiveDiagramIdState(diagramId);
      setRefreshKey((k) => k + 1);

      try {
        const res = await fetch(`/api/diagrams/${diagramId}/head`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.headScene) {
          loadSnapshot(ed.store, { document: data.headScene });
        } else {
          ed.deleteShapes([...ed.getCurrentPageShapeIds()]);
        }
      } catch {
        // Failed to load — keep empty canvas
      }
    },
    [saveHead]
  );

  const handleRestore = useCallback((scene: unknown) => {
    const ed = editorRef.current;
    if (!ed || !scene) return;

    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    loadSnapshot(ed.store, { document: scene as any });
  }, []);

  const preserveSnapshot = useCallback(async () => {
    const id = activeDiagramId.current;
    if (!id) return;

    setPreserving(true);
    try {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      await saveHead();

      const res = await fetch(`/api/diagrams/${id}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preserved: true }),
      });
      if (!res.ok) {
        toast.error("Failed to preserve snapshot");
        return;
      }
      const data = await res.json();
      if (data.snapshot) {
        toast.success("Preserved Snapshot saved");
        setRefreshKey((k) => k + 1);
      }
    } catch {
      toast.error("Failed to preserve snapshot");
    } finally {
      setPreserving(false);
    }
  }, [saveHead]);

  useEffect(() => {
    const unsub = subscribeChild((msg: ParentToChildMessage) => {
      if (msg.type === "loadDiagram") {
        loadDiagram(msg.diagramId);
      } else if (msg.type === "flush") {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        const ed = editorRef.current;
        const id = activeDiagramId.current;
        if (ed && id) {
          const { document } = getSnapshot(ed.store);
          fetch(`/api/diagrams/${id}/head`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(document),
          })
            .catch(() => {})
            .finally(() => {
              sendToParent({ type: "flushAck" });
            });
        } else {
          sendToParent({ type: "flushAck" });
        }
      }
    });
    return unsub;
  }, [loadDiagram]);

  useEffect(() => {
    function onFocus() {
      sendToParent({ type: "focus" });
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    if (mounted) {
      sendToParent({ type: "ready" });
    }
  }, [mounted]);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      setMounted(true);

      editor.sideEffects.registerBeforeCreateHandler("shape", (shape) => {
        if (
          shape.type === "image" ||
          shape.type === "video" ||
          shape.type === "embed"
        ) {
          toast.warning(
            "Images, videos, and embeds are not supported in v1. Only vector shapes and text are allowed."
          );
          return undefined as any;
        }
        return shape;
      });

      editor.store.listen(
        () => {
          if (activeDiagramId.current) {
            scheduleSave();
          }
        },
        { source: "user", scope: "document" }
      );
    },
    [scheduleSave]
  );

  return (
    <div className="flex h-screen w-screen">
      <div className="relative flex-1">
        <Tldraw
          onMount={handleMount}
          colorScheme="dark"
          acceptedImageMimeTypes={[]}
          acceptedVideoMimeTypes={[]}
          embeds={[]}
        />
        {activeDiagramIdState && (
          <div className="absolute top-2 right-2 z-50 flex gap-1.5">
            <button
              onClick={() => setTimelineOpen((o) => !o)}
              className="rounded bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-600"
            >
              {timelineOpen ? "Hide Timeline" : "Show Timeline"}
            </button>
            <button
              onClick={preserveSnapshot}
              disabled={preserving}
              className="rounded bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
            >
              {preserving ? "Preserving…" : "Preserve Snapshot"}
            </button>
          </div>
        )}
      </div>
      {activeDiagramIdState && timelineOpen && (
        <div className="flex w-64 shrink-0 flex-col border-l border-zinc-700 bg-zinc-900">
          <div className="border-b border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300">
            Snapshot Timeline
          </div>
          <div className="flex-1 overflow-y-auto">
            <TimelinePanel
              diagramId={activeDiagramIdState}
              onRestore={handleRestore}
              refreshKey={refreshKey}
            />
          </div>
        </div>
      )}
    </div>
  );
}
