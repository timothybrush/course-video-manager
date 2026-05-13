import { useEffect, useRef, useCallback, useState } from "react";
import { Tldraw, getSnapshot, loadSnapshot, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { toast } from "sonner";
import {
  subscribeChild,
  sendToParent,
  type ParentToChildMessage,
} from "@/lib/diagram-protocol";

const DEBOUNCE_MS = 500;

export default function DiagramPlayground() {
  const editorRef = useRef<Editor | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDiagramId = useRef<string | null>(null);
  const [mounted, setMounted] = useState(false);

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

      try {
        const res = await fetch(`/api/diagrams/${diagramId}/head`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.headScene) {
          loadSnapshot(ed.store, { document: data.headScene });
        } else {
          ed.store.clear();
        }
      } catch {
        // Failed to load — keep empty canvas
      }
    },
    [saveHead]
  );

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
    <div className="h-screen w-screen">
      <Tldraw
        onMount={handleMount}
        colorScheme="dark"
        acceptedImageMimeTypes={[]}
        acceptedVideoMimeTypes={[]}
        embeds={[]}
      />
    </div>
  );
}
