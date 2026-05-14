import { useEffect, useRef, useCallback, useState } from "react";
import { Tldraw, getSnapshot, loadSnapshot, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { Archive, ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import {
  subscribeChild,
  sendToParent,
  type ParentToChildMessage,
} from "@/lib/diagram-protocol";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DiagramThumbnail } from "@/features/diagrams/diagram-thumbnail";
import { useParams, useNavigate } from "react-router";

const DEBOUNCE_MS = 500;

const EMPTY_MIME_TYPES: string[] = [];
const EMPTY_EMBEDS: never[] = [];

interface Snapshot {
  id: string;
  diagramId: string;
  scene: unknown;
  contentHash: string;
  preserved: boolean;
  createdAt: string;
}

interface SnapshotListResponse {
  snapshots: Snapshot[];
  headContentHash: string | null;
}

function TimelinePanel({
  diagramId,
  onRestoreRequest,
  refreshKey,
}: {
  diagramId: string;
  onRestoreRequest: (snapshot: Snapshot, headIsPreserved: boolean) => void;
  refreshKey: number;
}) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [headContentHash, setHeadContentHash] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const fetchSnapshots = useCallback(() => {
    let cancelled = false;

    fetch(`/api/diagrams/${diagramId}/snapshots/list`)
      .then((res) =>
        res.ok ? (res.json() as Promise<SnapshotListResponse>) : null
      )
      .then((data) => {
        if (cancelled || !data) return;
        setSnapshots(data.snapshots);
        setHeadContentHash(data.headContentHash);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHasLoadedOnce(true);
      });

    return () => {
      cancelled = true;
    };
  }, [diagramId]);

  useEffect(() => {
    return fetchSnapshots();
  }, [fetchSnapshots, refreshKey]);

  const headIsPreserved =
    headContentHash != null &&
    snapshots.some((s) => s.preserved && s.contentHash === headContentHash);

  const handleRestoreClick = (snapshot: Snapshot) => {
    onRestoreRequest(snapshot, headIsPreserved);
  };

  const handleArchive = async (snapshot: Snapshot) => {
    setArchivingId(snapshot.id);
    try {
      const res = await fetch(`/api/diagram-snapshots/${snapshot.id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) {
        toast.error("Failed to archive snapshot");
        return;
      }
      setSnapshots((prev) => prev.filter((s) => s.id !== snapshot.id));
    } catch {
      toast.error("Failed to archive snapshot");
    } finally {
      setArchivingId(null);
    }
  };

  if (!hasLoadedOnce) {
    return <div className="p-3" />;
  }

  if (snapshots.length === 0) {
    return <div className="p-3 text-xs text-zinc-400">No snapshots yet</div>;
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {snapshots.map((snapshot) => (
        <button
          key={snapshot.id}
          type="button"
          onClick={() => handleRestoreClick(snapshot)}
          title="Restore snapshot"
          className="group flex h-14 items-center gap-2 overflow-hidden rounded border border-zinc-700 bg-zinc-800 pr-2 text-left hover:bg-zinc-700/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
        >
          <DiagramThumbnail
            diagramId={snapshot.diagramId}
            contentHash={snapshot.contentHash}
            scene={snapshot.scene}
            className="h-full w-20 shrink-0 object-contain bg-zinc-900"
          />
          <div className="min-w-0 flex-1" />
          <Button
            asChild
            variant="ghost"
            size="icon"
            title="Archive"
            aria-label="Archive snapshot"
            className="h-7 w-7 text-zinc-300 hover:text-zinc-100"
            disabled={archivingId === snapshot.id}
          >
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                if (archivingId !== snapshot.id) handleArchive(snapshot);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (archivingId !== snapshot.id) handleArchive(snapshot);
                }
              }}
            >
              <Archive className="h-3.5 w-3.5" />
            </span>
          </Button>
        </button>
      ))}
    </div>
  );
}

export default function DiagramPlaygroundActive() {
  const { diagramId } = useParams<{ diagramId: string }>();
  const navigate = useNavigate();
  const editorRef = useRef<Editor | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDiagramId = useRef<string | null>(diagramId ?? null);
  const [preserving, setPreserving] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingRestore, setPendingRestore] = useState<Snapshot | null>(null);
  const initialLoadDone = useRef(false);

  const saveHead = useCallback(async () => {
    const ed = editorRef.current;
    const id = activeDiagramId.current;
    if (!ed || !id) return;
    const { document } = getSnapshot(ed.store);
    try {
      await fetch(`/api/diagrams/${id}/head`, {
        method: "PATCH",
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

  const loadDiagramScene = useCallback(
    async (id: string) => {
      const ed = editorRef.current;
      if (!ed) return;

      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (activeDiagramId.current && activeDiagramId.current !== id) {
        await saveHead();
      }

      activeDiagramId.current = id;
      setRefreshKey((k) => k + 1);

      try {
        const res = await fetch(`/api/diagrams/${id}/head`);
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

  const performRestore = useCallback(async (snapshot: Snapshot) => {
    const ed = editorRef.current;
    const id = activeDiagramId.current;
    if (!ed || !id) return;

    try {
      const res = await fetch(`/api/diagrams/${id}/restore-to-head`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: snapshot.id }),
      });

      if (!res.ok) {
        toast.error("Failed to restore snapshot");
        return;
      }

      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      loadSnapshot(ed.store, { document: snapshot.scene as never });
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error("Failed to restore snapshot");
    }
  }, []);

  const handleRestoreRequest = useCallback(
    (snapshot: Snapshot, headIsPreserved: boolean) => {
      if (headIsPreserved) {
        performRestore(snapshot);
      } else {
        setPendingRestore(snapshot);
      }
    },
    [performRestore]
  );

  const preserveSnapshot = useCallback(async () => {
    const id = activeDiagramId.current;
    const ed = editorRef.current;
    if (!id || !ed) return;

    setPreserving(true);
    try {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      await saveHead();

      const shapeIds = Array.from(ed.getCurrentPageShapeIds());
      if (shapeIds.length === 0) {
        toast.error("Cannot preserve an empty diagram");
        return;
      }

      let thumbnailPngBase64: string;
      try {
        const { blob } = await ed.toImage(shapeIds, {
          format: "png",
          background: false,
          darkMode: true,
          padding: 32,
        });
        const buffer = await blob.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        thumbnailPngBase64 = btoa(binary);
      } catch {
        toast.error("Failed to render thumbnail");
        return;
      }

      const res = await fetch(`/api/diagrams/${id}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preserved: true, thumbnailPngBase64 }),
      });
      if (!res.ok) {
        toast.error("Failed to preserve snapshot");
        return;
      }
      const data = await res.json();
      if (data.snapshot) {
        setRefreshKey((k) => k + 1);
      }
    } catch {
      toast.error("Failed to preserve snapshot");
    } finally {
      setPreserving(false);
    }
  }, [saveHead]);

  // Emit activeDiagramChanged on mount
  useEffect(() => {
    if (diagramId) {
      sendToParent({ type: "activeDiagramChanged", diagramId });
    }
  }, [diagramId]);

  // Listen for parent messages (loadDiagram for switch, flush for save)
  useEffect(() => {
    const unsub = subscribeChild((msg: ParentToChildMessage) => {
      if (msg.type === "loadDiagram") {
        navigate(`/diagram-playground/${msg.diagramId}`, { replace: true });
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
            method: "PATCH",
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
  }, [navigate]);

  useEffect(() => {
    function onFocus() {
      sendToParent({ type: "focus" });
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      setIsFocusMode(editor.getInstanceState().isFocusMode);

      editor.sideEffects.registerBeforeCreateHandler("shape", (shape) => {
        if (
          shape.type === "image" ||
          shape.type === "video" ||
          shape.type === "embed"
        ) {
          toast.warning(
            "Images, videos, and embeds are not supported in v1. Only vector shapes and text are allowed."
          );
          return undefined as never;
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

      editor.store.listen(
        () => {
          setIsFocusMode(editor.getInstanceState().isFocusMode);
        },
        { scope: "session" }
      );

      // Load initial diagram from URL param
      if (diagramId && !initialLoadDone.current) {
        initialLoadDone.current = true;
        loadDiagramScene(diagramId);
      }
    },
    [scheduleSave, diagramId, loadDiagramScene]
  );

  const handleNavigateHome = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await saveHead();
    sendToParent({ type: "activeDiagramChanged", diagramId: null });
    navigate("/diagram-playground");
  }, [saveHead, navigate]);

  const timelineVisible = diagramId && !isFocusMode;

  return (
    <div className="flex h-screen w-screen">
      <div className="relative flex-1">
        <Tldraw
          onMount={handleMount}
          colorScheme="dark"
          acceptedImageMimeTypes={EMPTY_MIME_TYPES}
          acceptedVideoMimeTypes={EMPTY_MIME_TYPES}
          embeds={EMPTY_EMBEDS}
        />
        {!isFocusMode && (
          <button
            onClick={handleNavigateHome}
            className="absolute top-2 left-14 z-50 flex items-center gap-1 rounded bg-zinc-700/80 px-2 py-1 text-xs text-zinc-200 shadow hover:bg-zinc-600/80"
          >
            <ArrowLeft className="h-3 w-3" />
            All diagrams
          </button>
        )}
        {diagramId && (
          <button
            onClick={preserveSnapshot}
            disabled={preserving}
            title="Preserve Snapshot"
            aria-label="Preserve Snapshot"
            className="absolute bottom-16 right-2 z-50 flex h-9 w-9 items-center justify-center rounded bg-zinc-700 text-zinc-100 shadow hover:bg-zinc-600 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
          </button>
        )}
      </div>
      {timelineVisible && (
        <div className="flex w-64 shrink-0 flex-col border-l border-zinc-700 bg-zinc-900">
          <div className="border-b border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300">
            Snapshot Timeline
          </div>
          <div className="flex-1 overflow-y-auto">
            <TimelinePanel
              diagramId={diagramId}
              onRestoreRequest={handleRestoreRequest}
              refreshKey={refreshKey}
            />
          </div>
        </div>
      )}
      <Dialog
        open={pendingRestore !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRestore(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore snapshot?</DialogTitle>
            <DialogDescription>
              The current canvas has not been saved as a preserved snapshot.
              Restoring will replace it and you won't be able to recover it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingRestore(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const snap = pendingRestore;
                setPendingRestore(null);
                if (snap) performRestore(snap);
              }}
            >
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
