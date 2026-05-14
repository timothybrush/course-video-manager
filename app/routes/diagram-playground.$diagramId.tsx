import { useEffect, useRef, useCallback, useState } from "react";
import { Tldraw, getSnapshot, loadSnapshot, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import {
  AlertTriangle,
  ArrowLeft,
  Link2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { renderThumbnailPngBase64 } from "@/features/diagrams/render-thumbnail";
import { EditableDiagramName } from "@/features/diagrams/editable-diagram-name";
import {
  TimelinePanel,
  type Snapshot,
} from "@/features/diagrams/timeline-panel";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useParams, useNavigate, Link, useRevalidator } from "react-router";
import type { Route } from "./+types/diagram-playground.$diagramId";
import { loadDiagramPlaygroundActive } from "@/features/diagrams/diagram-playground-active.loader.server";

export const loader = loadDiagramPlaygroundActive;

const DEBOUNCE_MS = 500;

const EMPTY_MIME_TYPES: string[] = [];
const EMPTY_EMBEDS: never[] = [];

export default function DiagramPlaygroundActive({
  loaderData,
}: Route.ComponentProps) {
  const { diagrams } = loaderData;
  const { diagramId } = useParams<{ diagramId: string }>();
  const navigate = useNavigate();
  const editorRef = useRef<Editor | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDiagramId = useRef<string | null>(diagramId ?? null);
  const [preserving, setPreserving] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingRestore, setPendingRestore] = useState<Snapshot | null>(null);
  const [editorConnected, setEditorConnected] = useState(false);
  const [creating, setCreating] = useState(false);
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

      let thumbnailPngBase64: string | null;
      try {
        thumbnailPngBase64 = await renderThumbnailPngBase64(ed);
      } catch {
        toast.error("Failed to render thumbnail");
        return;
      }
      if (!thumbnailPngBase64) {
        toast.error("Cannot preserve an empty diagram");
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

  // Reload scene when navigating between diagrams in this same route
  useEffect(() => {
    if (
      diagramId &&
      editorRef.current &&
      initialLoadDone.current &&
      activeDiagramId.current !== diagramId
    ) {
      loadDiagramScene(diagramId);
    }
  }, [diagramId, loadDiagramScene]);

  // Ping the parent every 2s; mark disconnected if no pong within 5s.
  // Re-broadcast activeDiagramChanged alongside each ping so a parent that
  // joined the channel late (e.g. closed and reopened) re-learns the state.
  useEffect(() => {
    let lastPong = 0;
    const unsub = subscribeChild((msg: ParentToChildMessage) => {
      if (msg.type === "pong" || msg.type === "editorConnected") {
        lastPong = Date.now();
        setEditorConnected(true);
      } else if (msg.type === "editorDisconnected") {
        lastPong = 0;
        setEditorConnected(false);
      }
    });
    function beat() {
      sendToParent({ type: "ping" });
      sendToParent({
        type: "activeDiagramChanged",
        diagramId: diagramId ?? null,
      });
      if (Date.now() - lastPong > 5000) setEditorConnected(false);
    }
    const interval = setInterval(beat, 2000);
    beat();
    return () => {
      clearInterval(interval);
      unsub();
    };
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
      } else if (msg.type === "snapshotForClip") {
        const { clipId, diagramId: targetDiagramId } = msg;
        void (async () => {
          let ok = false;
          let snapshotId: string | null = null;
          const diagramName =
            diagrams.find((d) => d.id === targetDiagramId)?.name ?? null;
          try {
            const ed = editorRef.current;
            if (!ed || activeDiagramId.current !== targetDiagramId) return;

            if (saveTimer.current) {
              clearTimeout(saveTimer.current);
              saveTimer.current = null;
            }
            await saveHead();

            // Auto-pin thumbnails are best-effort; proceed without one if rendering fails.
            const thumbnailPngBase64 = await renderThumbnailPngBase64(ed).catch(
              () => null
            );

            const res = await fetch(
              `/api/diagrams/${targetDiagramId}/snapshots`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clipId, thumbnailPngBase64 }),
              }
            );
            ok = res.ok;
            if (ok) {
              try {
                const body = await res.json();
                snapshotId = body?.snapshot?.id ?? null;
              } catch {
                // ignore — snapshotId stays null
              }
              setRefreshKey((k) => k + 1);
            }
          } finally {
            sendToParent({
              type: "snapshotForClipDone",
              clipId,
              ok,
              snapshotId,
              diagramName,
            });
          }
        })();
      }
    });
    return unsub;
  }, [navigate, saveHead]);

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

  const revalidator = useRevalidator();
  const handleDeleteDiagram = useCallback(
    async (id: string) => {
      try {
        const fd = new FormData();
        fd.set("archived", "true");
        const res = await fetch(`/api/diagrams/${id}/update`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          toast.error("Failed to delete diagram");
          return;
        }
        if (id === diagramId) {
          const idx = diagrams.findIndex((d) => d.id === id);
          const neighbor =
            (idx >= 0 ? diagrams[idx + 1] : undefined) ??
            (idx > 0 ? diagrams[idx - 1] : undefined);
          if (neighbor) {
            navigate(`/diagram-playground/${neighbor.id}`);
          } else {
            navigate("/diagram-playground");
          }
        } else {
          revalidator.revalidate();
        }
      } catch {
        toast.error("Failed to delete diagram");
      }
    },
    [diagramId, diagrams, navigate, revalidator]
  );

  const handleCreateDiagram = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      await saveHead();
      const res = await fetch("/api/diagrams/create", { method: "POST" });
      if (!res.ok) {
        toast.error("Failed to create diagram");
        return;
      }
      const { id } = await res.json();
      navigate(`/diagram-playground/${id}`);
    } catch {
      toast.error("Failed to create diagram");
    } finally {
      setCreating(false);
    }
  }, [creating, saveHead, navigate]);

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
      {!isFocusMode && (
        <div className="flex w-56 shrink-0 flex-col border-r border-zinc-700 bg-zinc-900">
          <div className="flex items-stretch border-b border-zinc-700">
            <button
              onClick={handleNavigateHome}
              className="flex flex-1 items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
            >
              <ArrowLeft className="h-3 w-3" />
              All Diagrams
            </button>
            <button
              onClick={handleCreateDiagram}
              disabled={creating}
              title="New diagram"
              aria-label="New diagram"
              className="flex items-center justify-center border-l border-zinc-700 px-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <div className="flex flex-col gap-1">
              {diagrams.map((d) => {
                const isActive = d.id === diagramId;
                return (
                  <ContextMenu key={d.id}>
                    <ContextMenuTrigger asChild>
                      <div
                        className={
                          "flex items-center gap-2 overflow-hidden rounded border border-zinc-700 " +
                          (isActive
                            ? "bg-zinc-700/60"
                            : "bg-zinc-800 hover:bg-zinc-700/40")
                        }
                      >
                        <Link
                          to={`/diagram-playground/${d.id}`}
                          className="h-10 w-14 shrink-0 bg-zinc-900"
                          aria-label={`Open ${d.name}`}
                        >
                          <DiagramThumbnail
                            diagramId={d.id}
                            contentHash={d.thumbnailContentHash ?? undefined}
                            className="h-full w-full object-contain"
                          />
                        </Link>
                        <div className="min-w-0 flex-1 pr-2">
                          <EditableDiagramName
                            diagramId={d.id}
                            name={d.name}
                            className={
                              "block w-full truncate text-sm " +
                              (isActive ? "text-zinc-100" : "text-zinc-300")
                            }
                            inputClassName="w-full rounded bg-zinc-900 px-1 text-sm text-zinc-100 outline-none ring-1 ring-zinc-500"
                          />
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        variant="destructive"
                        onSelect={() => handleDeleteDiagram(d.id)}
                      >
                        <Trash2 />
                        Delete
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <div className="relative flex-1">
        <Tldraw
          onMount={handleMount}
          colorScheme="dark"
          acceptedImageMimeTypes={EMPTY_MIME_TYPES}
          acceptedVideoMimeTypes={EMPTY_MIME_TYPES}
          embeds={EMPTY_EMBEDS}
        />
        {diagramId && (
          <button
            onClick={preserveSnapshot}
            disabled={preserving}
            title="Preserve Snapshot"
            aria-label="Preserve Snapshot"
            className="absolute bottom-16 right-2 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-700 text-zinc-100 shadow hover:bg-zinc-600 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
          </button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              aria-label={
                editorConnected
                  ? "Connected to video editor"
                  : "Not connected to a video editor"
              }
              className={
                "absolute bottom-28 right-2 z-50 flex h-9 w-9 items-center justify-center rounded-full shadow " +
                (editorConnected
                  ? "bg-zinc-700/80 text-zinc-300"
                  : "bg-amber-900/80 text-amber-300")
              }
            >
              {editorConnected ? (
                <Link2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="left">
            {editorConnected
              ? "Connected to video editor"
              : "Not connected to video editor"}
          </TooltipContent>
        </Tooltip>
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
