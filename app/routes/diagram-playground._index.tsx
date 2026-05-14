import { useEffect } from "react";
import { sendToParent } from "@/lib/diagram-protocol";

export default function DiagramPlaygroundHome() {
  useEffect(() => {
    sendToParent({ type: "activeDiagramChanged", diagramId: null });
  }, []);

  useEffect(() => {
    function onFocus() {
      sendToParent({ type: "focus" });
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-zinc-900 text-zinc-100">
      <div className="text-center">
        <h1 className="text-xl font-semibold mb-2">Diagrams home</h1>
        <p className="text-sm text-zinc-400">Coming soon</p>
      </div>
    </div>
  );
}
