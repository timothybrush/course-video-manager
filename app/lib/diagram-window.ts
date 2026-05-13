import {
  sendToChild,
  subscribeParent,
  type ChildToParentMessage,
} from "./diagram-protocol";

const PLAYGROUND_PATH = "/diagram-playground";
const WINDOW_NAME = "cvm-diagrams";
const POPUP_FEATURES = "popup,width=1100,height=800";

let childHandle: Window | null = null;
let pendingDiagramId: string | null = null;
let unsubscribe: (() => void) | null = null;

function ensureSubscribed(): void {
  if (unsubscribe) return;
  unsubscribe = subscribeParent((msg: ChildToParentMessage) => {
    if (msg.type === "ready" && pendingDiagramId) {
      const handle = getPlaygroundHandle();
      if (handle) {
        sendToChild(handle, {
          type: "loadDiagram",
          diagramId: pendingDiagramId,
        });
      }
      pendingDiagramId = null;
    }
  });
}

export function getPlaygroundHandle(): Window | null {
  if (childHandle && !childHandle.closed) return childHandle;
  return null;
}

export function openPlayground(): Window | null {
  const existing = getPlaygroundHandle();
  if (existing) {
    existing.focus();
    return existing;
  }
  const w = window.open(PLAYGROUND_PATH, WINDOW_NAME, POPUP_FEATURES);
  childHandle = w;
  return w;
}

export function openPlaygroundWithDiagram(diagramId: string): void {
  ensureSubscribed();
  const existing = getPlaygroundHandle();
  if (existing) {
    existing.focus();
    sendToChild(existing, { type: "loadDiagram", diagramId });
    return;
  }

  pendingDiagramId = diagramId;
  const w = window.open(PLAYGROUND_PATH, WINDOW_NAME, POPUP_FEATURES);
  childHandle = w;
}
