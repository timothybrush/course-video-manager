import { useEffect, useRef, useState } from "react";
import type { OBSConnectionOuterState } from "./obs-connector";
import type { EnsureProfileResult } from "./ensure-obs-profile";

export function useEnsureOBSProfile(opts: {
  obsState: OBSConnectionOuterState;
  targetProfile: string;
  ensureProfile: (targetProfile: string) => Promise<EnsureProfileResult>;
  onError: (message: string) => void;
}): { profileReady: boolean } {
  const [profileReady, setProfileReady] = useState(false);
  const hasEnsuredRef = useRef(false);

  useEffect(() => {
    if (opts.obsState.type !== "obs-connected") {
      hasEnsuredRef.current = false;
      setProfileReady(false);
      return;
    }

    if (hasEnsuredRef.current) return;

    if (opts.obsState.profile === opts.targetProfile) {
      hasEnsuredRef.current = true;
      setProfileReady(true);
      return;
    }

    hasEnsuredRef.current = true;
    opts.ensureProfile(opts.targetProfile).then((result) => {
      if (result.type === "error") {
        opts.onError(result.message);
      }
      setProfileReady(true);
    });
  }, [opts.obsState.type, opts.targetProfile]);

  return { profileReady };
}
