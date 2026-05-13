import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { FrontendId } from "../clip-state-reducer.types";

type Diagram = {
  id: string;
  name: string;
  archived: boolean;
};

type Snapshot = {
  id: string;
  diagramId: string;
  preserved: boolean;
  createdAt: string;
};

type Step = "pick-diagram" | "pick-snapshot";

export const AttachDiagramDialog = (props: {
  clipId: FrontendId | null;
  onClose: () => void;
  onSelect: (
    clipId: FrontendId,
    snapshotId: string,
    diagramName: string
  ) => void;
}) => {
  const { clipId, onClose, onSelect } = props;
  const [step, setStep] = useState<Step>("pick-diagram");
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selectedDiagram, setSelectedDiagram] = useState<Diagram | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDiagrams = useCallback(() => {
    setLoading(true);
    fetch("/api/diagrams/list")
      .then((res) => res.json())
      .then((data: { diagrams: Diagram[] }) => {
        setDiagrams(data.diagrams);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (clipId) {
      setStep("pick-diagram");
      setSelectedDiagram(null);
      setSnapshots([]);
      loadDiagrams();
    }
  }, [clipId, loadDiagrams]);

  const loadSnapshots = useCallback((diagram: Diagram) => {
    setSelectedDiagram(diagram);
    setStep("pick-snapshot");
    setLoading(true);
    fetch(`/api/diagrams/${diagram.id}/snapshots/list`)
      .then((res) => res.json())
      .then((data: { snapshots: Snapshot[] }) => {
        setSnapshots(data.snapshots);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <Dialog open={clipId !== null} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "pick-diagram"
              ? "Attach Diagram"
              : `${selectedDiagram?.name} — Pick Snapshot`}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : step === "pick-diagram" ? (
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {diagrams.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">
                No diagrams yet
              </p>
            ) : (
              diagrams.map((d) => (
                <button
                  key={d.id}
                  className="text-left px-3 py-2 rounded hover:bg-muted text-sm"
                  onClick={() => loadSnapshots(d)}
                >
                  {d.name}
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            <button
              className="text-left px-3 py-2 rounded hover:bg-muted text-xs text-muted-foreground"
              onClick={() => setStep("pick-diagram")}
            >
              &larr; Back to diagrams
            </button>
            {snapshots.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">
                No visible snapshots
              </p>
            ) : (
              snapshots.map((s) => (
                <button
                  key={s.id}
                  className="text-left px-3 py-2 rounded hover:bg-muted text-sm flex items-center gap-2"
                  onClick={() => {
                    if (clipId && selectedDiagram) {
                      onSelect(clipId, s.id, selectedDiagram.name);
                      onClose();
                    }
                  }}
                >
                  <span>
                    {new Date(s.createdAt).toLocaleDateString()}{" "}
                    {new Date(s.createdAt).toLocaleTimeString()}
                  </span>
                  {s.preserved && (
                    <span className="text-xs bg-muted-foreground/20 px-1.5 py-0.5 rounded">
                      Preserved
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
