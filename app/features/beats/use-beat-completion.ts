import { useCallback, useState } from "react";
import { getBeatCompletion, setBeatCompletion } from "./beat-completion";

export function useBeatCompletion(beatId: string) {
  const [completed, setCompleted] = useState(() => getBeatCompletion(beatId));

  const toggle = useCallback(() => {
    setCompleted((prev) => {
      const next = !prev;
      setBeatCompletion(beatId, next);
      return next;
    });
  }, [beatId]);

  return [completed, toggle] as const;
}
