// Dependency Group spine — the dashed icon-to-icon lines drawn in the compact
// course view to mark contiguous runs of dependency-linked lessons (see the
// "Dependency Group" entry in CONTEXT.md and docs/adr/0010).
//
// The lines are MEASURED from the rendered icon positions rather than drawn at a
// fixed pixel height: a lesson's row height changes when its title wraps to two
// lines, so any hard-coded segment height drifts off the icon centres. A
// ResizeObserver re-measures on every reflow, keeping each segment pinned exactly
// between the two icon centres it connects.

import { cn } from "@/lib/utils";
import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

// A Dependency Group reserves whitespace above AND below itself, so the block is
// separated from whatever precedes and follows it (a lone lesson or another
// group). Edges are zeroed (first:/last:) so there's no dangling gap at the
// top/bottom of the list; adjacent block margins collapse, so two touching groups
// share one gap. Lone lessons (run length 1) get no extra spacing, so consecutive
// ungrouped lessons stay tight.
//
// The 20px gap must stay comfortably larger than the ~14px intra-group row
// spacing — otherwise the gap inside a group rivals the gap around it and the
// blocks stop reading as blocks.
export function runSpacingClass(isGroup: boolean): string {
  return isGroup ? "mt-5 mb-5 first:mt-0 last:mb-0" : "";
}

type Segment = { x: number; top: number; height: number };

// Draws a dashed segment between each connected adjacent pair of lesson icons.
// `pairs` is [topLessonId, bottomLessonId][]; each id must match a rendered
// `[data-dep-icon]` element inside the container.
function MeasuredSpine({
  containerRef,
  pairs,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  pairs: [string, string][];
}) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const pairsKey = pairs.map((p) => p.join(">")).join("|");

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let raf1 = 0;
    let raf2 = 0;

    const measure = () => {
      if (cancelled) return;
      const base = container.getBoundingClientRect();
      const next: Segment[] = [];
      for (const [a, b] of pairs) {
        const ea = container.querySelector(
          `[data-dep-icon="${CSS.escape(a)}"]`
        );
        const eb = container.querySelector(
          `[data-dep-icon="${CSS.escape(b)}"]`
        );
        if (!ea || !eb) continue;
        const ra = ea.getBoundingClientRect();
        const rb = eb.getBoundingClientRect();
        const x = ra.left + ra.width / 2 - base.left;
        const top = ra.bottom - base.top;
        const height = rb.top - base.top - top;
        if (height > 0) next.push({ x, top, height });
      }
      setSegments(next);
    };

    // Measure now, then again after layout settles. The synchronous pass can
    // run before rows reach their final positions (streamed data, web-font
    // swap, loading thumbnails) — that momentarily collapses the icon rects,
    // making every segment height <= 0 so the whole spine is dropped. Nothing
    // would then re-trigger it, because the container's own box never changed.
    // Re-measuring on the next frames and on font load recovers the line.
    measure();
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(measure);
    });
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }

    const ro = new ResizeObserver(measure);
    ro.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, pairsKey]);

  return (
    <div className="pointer-events-none absolute inset-0">
      {segments.map((s, i) => (
        <span
          key={i}
          className="absolute w-0 border-l border-dashed border-muted-foreground/50"
          style={{ left: s.x, top: s.top, height: s.height }}
        />
      ))}
    </div>
  );
}

// Wraps a section's lesson list, owns the positioning context + the spine overlay.
// `pairs` is empty whenever grouping is suppressed (expanded view, or an active
// filter), in which case no overlay renders.
export function CompactLessonList({
  pairs,
  className,
  children,
}: {
  pairs: [string, string][];
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className={cn("relative", className)}>
      {children}
      {pairs.length > 0 && <MeasuredSpine containerRef={ref} pairs={pairs} />}
    </div>
  );
}
