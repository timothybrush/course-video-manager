import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ReferenceCandidate = {
  id: string;
  path: string;
  clips: Array<{ id: string; order: string; text: string }>;
  clipSections: Array<{ id: string; order: string; name: string }>;
};

type Group = { sectionName: string | null; clipTexts: string[] };

const groupByClipSection = (candidate: ReferenceCandidate): Group[] => {
  const items = [
    ...candidate.clipSections.map((s) => ({
      kind: "section" as const,
      order: s.order,
      name: s.name,
    })),
    ...candidate.clips.map((c) => ({
      kind: "clip" as const,
      order: c.order,
      text: c.text,
    })),
  ].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

  const groups: Group[] = [];
  let current: Group = { sectionName: null, clipTexts: [] };
  for (const item of items) {
    if (item.kind === "section") {
      if (current.clipTexts.length > 0 || current.sectionName !== null) {
        groups.push(current);
      }
      current = { sectionName: item.name, clipTexts: [] };
    } else {
      current.clipTexts.push(item.text);
    }
  }
  if (current.clipTexts.length > 0 || current.sectionName !== null) {
    groups.push(current);
  }
  return groups;
};

export const ReferencePanel = (props: {
  candidates: ReferenceCandidate[];
  selectedId: string;
  onSelect: (id: string) => void;
  onRemove: () => void;
  className?: string;
}) => {
  const selected =
    props.candidates.find((c) => c.id === props.selectedId) ??
    props.candidates[0];

  if (!selected) return null;

  const groups = groupByClipSection(selected);
  const totalClips = selected.clips.length;

  return (
    <div
      className={cn(
        "border rounded-lg bg-muted/30 flex flex-col min-h-0",
        props.className
      )}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold shrink-0">
            Reference
          </span>
          {props.candidates.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-medium hover:bg-muted px-2 py-0.5 rounded min-w-0"
                >
                  <span className="truncate">{selected.path}</span>
                  <ChevronDown className="size-3 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {props.candidates.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onSelect={() => props.onSelect(c.id)}
                  >
                    {c.path}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="text-xs font-medium truncate">
              {selected.path}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-muted-foreground">
            {totalClips} clips
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="size-6 p-0"
            onClick={props.onRemove}
            aria-label="Remove reference"
          >
            <X className="size-3" />
          </Button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 px-3 py-2 space-y-3">
        {groups.map((group, gi) => (
          <div key={gi}>
            {group.sectionName !== null && (
              <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                {group.sectionName}
              </h4>
            )}
            <div className="space-y-1.5">
              {group.clipTexts.map((text, i) => (
                <p key={i} className="text-foreground/80 leading-snug text-sm">
                  {text}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
