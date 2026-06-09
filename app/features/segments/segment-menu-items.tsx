import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { Trash2 } from "lucide-react";
import {
  SEGMENT_KINDS,
  SEGMENT_KIND_DESCRIPTIONS,
  SEGMENT_KIND_ICONS,
  SEGMENT_KIND_LABELS,
  type SegmentKind,
} from "./segment-kinds";

/**
 * Five context-menu items, one per Segment kind, each with its distinct icon.
 * Used both to create a Segment of a kind (on a Video) and to reclassify one
 * (on a Segment).
 */
export function SegmentKindMenuItems({
  onSelect,
}: {
  onSelect: (kind: SegmentKind) => void;
}) {
  return (
    <>
      {SEGMENT_KINDS.map((kind) => {
        const Icon = SEGMENT_KIND_ICONS[kind];
        return (
          <ContextMenuItem
            key={kind}
            onSelect={() => onSelect(kind)}
            className="items-start gap-2"
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex flex-col">
              <span>{SEGMENT_KIND_LABELS[kind]}</span>
              <span className="text-xs text-muted-foreground">
                {SEGMENT_KIND_DESCRIPTIONS[kind]}
              </span>
            </div>
          </ContextMenuItem>
        );
      })}
    </>
  );
}

/** "Add segment ▸ <kind>" submenu for a Video's context menu. */
export function AddSegmentSubMenu({
  onAdd,
}: {
  onAdd: (kind: SegmentKind) => void;
}) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>Add segment</ContextMenuSubTrigger>
      <ContextMenuSubContent>
        <SegmentKindMenuItems onSelect={onAdd} />
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

/** A Segment's own context menu: change kind (five choices) + delete. */
export function SegmentContextMenuContent({
  onSetKind,
  onDelete,
}: {
  onSetKind: (kind: SegmentKind) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <ContextMenuSub>
        <ContextMenuSubTrigger>Change kind</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <SegmentKindMenuItems onSelect={onSetKind} />
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={onDelete}>
        <Trash2 className="w-4 h-4" />
        Delete
      </ContextMenuItem>
    </>
  );
}
