import { z } from "zod";

export const ParentToChild = z.discriminatedUnion("type", [
  z.object({ type: z.literal("loadDiagram"), diagramId: z.string() }),
  z.object({ type: z.literal("flush") }),
]);

export const ChildToParent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("focus") }),
  z.object({ type: z.literal("flushAck") }),
  z.object({
    type: z.literal("activeDiagramChanged"),
    diagramId: z.string().nullable(),
  }),
]);

export type ParentToChildMessage = z.infer<typeof ParentToChild>;
export type ChildToParentMessage = z.infer<typeof ChildToParent>;

const ORIGIN = typeof window !== "undefined" ? window.location.origin : "";

export function sendToChild(
  child: Window,
  message: ParentToChildMessage
): void {
  child.postMessage(message, ORIGIN);
}

export function sendToParent(message: ChildToParentMessage): void {
  window.opener?.postMessage(message, ORIGIN);
}

export function subscribeParent(
  handler: (message: ChildToParentMessage) => void
): () => void {
  function onMessage(e: MessageEvent) {
    if (e.origin !== ORIGIN) return;
    const result = ChildToParent.safeParse(e.data);
    if (result.success) handler(result.data);
  }
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

export function subscribeChild(
  handler: (message: ParentToChildMessage) => void
): () => void {
  function onMessage(e: MessageEvent) {
    if (e.origin !== ORIGIN) return;
    const result = ParentToChild.safeParse(e.data);
    if (result.success) handler(result.data);
  }
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
