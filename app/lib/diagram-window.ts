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

let _activeDiagramId: string | null = null;
let _diagramFocusedDuringClip = false;

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
    if (msg.type === "focus") {
      _diagramFocusedDuringClip = true;
    }
  });
}

export function getPlaygroundHandle(): Window | null {
  if (childHandle && !childHandle.closed) return childHandle;
  return null;
}

export function openPlayground(): Window | null {
  ensureSubscribed();
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
    _activeDiagramId = diagramId;
    return;
  }

  pendingDiagramId = diagramId;
  _activeDiagramId = diagramId;
  const w = window.open(PLAYGROUND_PATH, WINDOW_NAME, POPUP_FEATURES);
  childHandle = w;
}

export function getActiveDiagramId(): string | null {
  if (!getPlaygroundHandle()) return null;
  return _activeDiagramId;
}

export function getDiagramFocusedDuringClip(): boolean {
  return _diagramFocusedDuringClip;
}

export function resetDiagramFocusTracking(): void {
  _diagramFocusedDuringClip = false;
}

export function flushDiagramPlayground(): Promise<void> {
  const handle = getPlaygroundHandle();
  if (!handle) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      unsub();
      resolve();
    }, 5000);
    const unsub = subscribeParent((msg) => {
      if (msg.type === "flushAck") {
        clearTimeout(timer);
        unsub();
        resolve();
      }
    });
    sendToChild(handle, { type: "flush" });
  });
}
