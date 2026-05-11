import { CalendarClock, Lightbulb, XCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type PitchStatus = "idle" | "scheduled" | "cancelled";

export const STATUS_META: Record<
  PitchStatus,
  {
    label: string;
    icon: typeof Lightbulb;
    iconWrap: string;
  }
> = {
  idle: {
    label: "Idle",
    icon: Lightbulb,
    iconWrap: "bg-muted text-muted-foreground",
  },
  scheduled: {
    label: "Scheduled",
    icon: CalendarClock,
    iconWrap: "bg-muted text-muted-foreground",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    iconWrap: "bg-muted text-muted-foreground",
  },
};

export function StatusIconBadge({
  status,
  onSelect,
  readOnly,
  showLabel,
}: {
  status: PitchStatus;
  onSelect?: (s: PitchStatus) => void;
  readOnly?: boolean;
  showLabel?: boolean;
}) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  const trigger = showLabel ? (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 h-6 pl-1 pr-2.5 rounded-full text-xs font-medium",
        m.iconWrap
      )}
      title={readOnly ? m.label : `${m.label} — click to change`}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full">
        <Icon className="w-3 h-3" />
      </span>
      {m.label}
    </button>
  ) : (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center w-6 h-6 rounded-full",
        m.iconWrap
      )}
      title={readOnly ? m.label : `${m.label} — click to change`}
      onClick={(e) => e.stopPropagation()}
    >
      <Icon className="w-3 h-3" />
    </button>
  );
  if (readOnly || !onSelect) return trigger;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        {(["idle", "scheduled", "cancelled"] as const).map((s) => {
          const sm = STATUS_META[s];
          const SIcon = sm.icon;
          return (
            <DropdownMenuItem
              key={s}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(s);
              }}
              className={cn(
                "text-xs font-medium flex items-center gap-2",
                status === s && "bg-accent"
              )}
            >
              <span
                className={cn(
                  "inline-flex items-center justify-center w-5 h-5 rounded-full",
                  sm.iconWrap
                )}
              >
                <SIcon className="w-3 h-3" />
              </span>
              {sm.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
