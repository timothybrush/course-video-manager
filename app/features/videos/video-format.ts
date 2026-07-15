export const VIDEO_FORMATS = ["landscape", "short"] as const;

export type VideoFormat = (typeof VIDEO_FORMATS)[number];

export const DEFAULT_VIDEO_FORMAT: VideoFormat = "landscape";

export const VIDEO_FORMAT_LABELS: Record<VideoFormat, string> = {
  landscape: "Landscape",
  short: "Short",
};
