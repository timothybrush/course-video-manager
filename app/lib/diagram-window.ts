import {
  sendToChild,
  subscribeParent,
  type ChildToParentMessage,
} from "./diagram-protocol";
import { notifyDiagramFocus } from "./diagram-focus-tracking";

const PLAYGROUND_PATH = "/diagram-playground";
const WINDOW_NAME = "cvm-diagrams";
const POPUP_FEATURES = "popup,width=1100,height=800";

let childHandle: Window | null = null;
let unsubscribe: (() => void) | null = null;

let _activeDiagramId: string | null = null;

function ensureSubscribed(): void {
  if (unsubscribe) return;
  unsubscribe = subscribeParent((msg: ChildToParentMessage) => {
    if (msg.type === "activeDiagramChanged") {
      _activeDiagramId = msg.diagramId;
    }
    if (msg.type === "focus") {
      notifyDiagramFocus();
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

  _activeDiagramId = diagramId;
  const w = window.open(
    `${PLAYGROUND_PATH}/${diagramId}`,
    WINDOW_NAME,
    POPUP_FEATURES
  );
  childHandle = w;
}

export function getActiveDiagramId(): string | null {
  if (!getPlaygroundHandle()) return null;
  return _activeDiagramId;
}

export {
  getDiagramFocusedDuringClip,
  startDiagramFocusTracking,
  stopDiagramFocusTracking,
} from "./diagram-focus-tracking";

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
