import { useEffect, useRef, useCallback } from "react";
import type { ClipReducerState } from "@/features/video-editor/clip-state-reducer";

export function useAiNameShort(opts: {
  videoId: string;
  format: string;
  clipState: ClipReducerState;
  onNamed: () => void;
}) {
  const hasTriggeredRef = useRef(false);
  const wasRecordingRef = useRef(false);

  const trigger = useCallback(async () => {
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;

    try {
      const res = await fetch(`/api/videos/${opts.videoId}/ai-name-describe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.title) {
          opts.onNamed();
        }
      }
    } catch {
      // Best-effort — the user can rename manually
    }
  }, [opts.videoId, opts.onNamed]);

  useEffect(() => {
    if (opts.format !== "short") return;

    const hasSessions = opts.clipState.sessions.length > 0;
    const hasRecordingSession = opts.clipState.sessions.some(
      (s) => s.status === "recording" || s.status === "polling"
    );

    if (hasRecordingSession) {
      wasRecordingRef.current = true;
    }

    const allDone =
      hasSessions && opts.clipState.sessions.every((s) => s.status === "done");

    if (wasRecordingRef.current && allDone) {
      trigger();
    }
  }, [opts.format, opts.clipState.sessions, trigger]);
}
