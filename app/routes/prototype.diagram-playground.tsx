// PROTOTYPE — throwaway. Child window of /prototype/diagram-parent.
// Mounts TLDraw, autosaves head to localStorage on a debounce, forwards focus
// events to parent, and answers flush requests with a flushAck.

import { useEffect, useRef, useState } from "react";
import { Tldraw, getSnapshot, type Editor } from "tldraw";
import "tldraw/tldraw.css";

const STORAGE_KEY = "proto-diagram-head";
const DEBOUNCE_MS = 500;

export default function DiagramPlaygroundProto() {
  const editorRef = useRef<Editor | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDirty = useRef(false);
  const [saves, setSaves] = useState(0);
  const [lastFlushAt, setLastFlushAt] = useState<string | null>(null);

  function saveHead(reason: "debounce" | "flush") {
    const ed = editorRef.current;
    if (!ed) return 0;
    const { document } = getSnapshot(ed.store);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
    pendingDirty.current = false;
    setSaves((n) => n + 1);
    const shapeCount = Object.values(document.store).filter(
      (r: any) => r?.typeName === "shape"
    ).length;
    if (reason === "flush") setLastFlushAt(new Date().toISOString());
    return shapeCount;
  }

  // postMessage handler — listen for "flush" from parent
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "flush") {
        // Commit any pending debounced edit synchronously, then ack.
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        const shapeCount = saveHead("flush");
        window.opener?.postMessage(
          { type: "flushAck", shapeCount },
          window.location.origin
        );
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Forward window focus to parent
  useEffect(() => {
    function onFocus() {
      window.opener?.postMessage({ type: "focus" }, window.location.origin);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Announce ready
  useEffect(() => {
    window.opener?.postMessage({ type: "ready" }, window.location.origin);
  }, []);

  function handleMount(editor: Editor) {
    editorRef.current = editor;
    editor.user.updateUserPreferences({ colorScheme: "dark" });
    // Subscribe to document-store changes; debounce a save.
    editor.store.listen(
      () => {
        pendingDirty.current = true;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => saveHead("debounce"), DEBOUNCE_MS);
      },
      { source: "user", scope: "document" }
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col">
      <div className="px-3 py-2 border-b text-xs font-mono flex gap-4 bg-muted/40">
        <span>PROTOTYPE — diagram playground</span>
        <span>autosaves: {saves}</span>
        <span>dirty: {pendingDirty.current ? "yes" : "no"}</span>
        <span>last flush: {lastFlushAt ?? "—"}</span>
        <span>
          opener:{" "}
          {typeof window !== "undefined" && window.opener ? "ok" : "none"}
        </span>
      </div>
      <div className="flex-1">
        <Tldraw onMount={handleMount} />
      </div>
    </div>
  );
}
