// PROTOTYPE — throwaway. De-risks cross-window postMessage + TLDraw integration
// for the diagrams feature. Delete (or absorb the verdict into the real code)
// once questions in NOTES are answered. See /tmp/handoff-psoJYt.md.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const PLAYGROUND_PATH = "/prototype/diagram-playground";
const WINDOW_NAME = "cvm-diagrams";
const STORAGE_KEY = "proto-diagram-head";

type FocusEvt = { at: string };

export default function DiagramParentProto() {
  const childRef = useRef<Window | null>(null);
  const [focusEvents, setFocusEvents] = useState<FocusEvt[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [head, setHead] = useState<string>("(not loaded)");
  const [headRaw, setHeadRaw] = useState<string>("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );
  const pendingFlush = useRef<((v: unknown) => void) | null>(null);

  const append = (s: string) =>
    setLog((l) =>
      [`${new Date().toISOString().slice(11, 23)}  ${s}`, ...l].slice(0, 50)
    );

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "focus") {
        setFocusEvents((f) =>
          [{ at: new Date().toISOString() }, ...f].slice(0, 30)
        );
        append(`← focus`);
      } else if (data.type === "flushAck") {
        append(`← flushAck (${data.shapeCount} shapes)`);
        pendingFlush.current?.(null);
        pendingFlush.current = null;
      } else if (data.type === "ready") {
        append(`← ready`);
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  function spawn() {
    if (childRef.current && !childRef.current.closed) {
      childRef.current.focus();
      append(`→ focus existing playground`);
      return;
    }
    const w = window.open(
      PLAYGROUND_PATH,
      WINDOW_NAME,
      "popup,width=1100,height=800"
    );
    childRef.current = w;
    append(`→ window.open (handle ${w ? "ok" : "null"})`);
  }

  async function flushAndRead() {
    if (!childRef.current || childRef.current.closed) {
      append("! no child window — spawn first");
      return;
    }
    append(`→ flush`);
    const waitAck = new Promise((res) => (pendingFlush.current = res));
    childRef.current.postMessage({ type: "flush" }, window.location.origin);
    const timeout = new Promise((res) =>
      setTimeout(() => res("timeout"), 2000)
    );
    const result = await Promise.race([waitAck, timeout]);
    if (result === "timeout") append(`! flushAck timeout`);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    setHeadRaw(raw ?? "");
    setHead(
      raw ? raw.slice(0, 500) + (raw.length > 500 ? "…" : "") : "(empty)"
    );
  }

  async function copyHead() {
    if (!headRaw) {
      setCopyState("failed");
      append("! nothing to copy — flush first");
      setTimeout(() => setCopyState("idle"), 1500);
      return;
    }
    try {
      await navigator.clipboard.writeText(headRaw);
      setCopyState("copied");
      append(`✓ copied head (${headRaw.length} chars)`);
    } catch (err) {
      setCopyState("failed");
      append(`! clipboard failed: ${String(err)}`);
    }
    setTimeout(() => setCopyState("idle"), 1500);
  }

  function reload() {
    window.location.reload();
  }

  return (
    <div className="p-6 max-w-5xl mx-auto font-mono text-sm">
      <h1 className="text-xl font-bold mb-1">Diagram parent — prototype</h1>
      <p className="text-muted-foreground mb-4">
        Tests postMessage round-trip with a child playground window. Throwaway.
      </p>

      <div className="flex gap-2 mb-4">
        <Button onClick={spawn}>Spawn playground</Button>
        <Button onClick={flushAndRead} variant="secondary">
          Flush + read head
        </Button>
        <Button onClick={reload} variant="outline">
          Reload parent (test child survival)
        </Button>
        <Button onClick={copyHead} variant="outline">
          {copyState === "copied"
            ? "Copied ✓"
            : copyState === "failed"
              ? "Copy failed"
              : "Copy head to clipboard"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <section>
          <h2 className="font-semibold mb-1">Focus events received</h2>
          <div className="border rounded p-2 h-48 overflow-auto bg-muted/30">
            {focusEvents.length === 0 ? (
              <div className="text-muted-foreground">none yet</div>
            ) : (
              focusEvents.map((f, i) => <div key={i}>{f.at}</div>)
            )}
          </div>
        </section>

        <section>
          <h2 className="font-semibold mb-1">Event log</h2>
          <div className="border rounded p-2 h-48 overflow-auto bg-muted/30">
            {log.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-4">
        <h2 className="font-semibold mb-1">
          Current head (read from localStorage after flush)
        </h2>
        <pre className="border rounded p-2 bg-muted/30 max-h-64 overflow-auto whitespace-pre-wrap break-all">
          {head}
        </pre>
      </section>
    </div>
  );
}
