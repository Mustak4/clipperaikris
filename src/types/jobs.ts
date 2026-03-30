export type CaptionPreset = "clean" | "bold" | "neon";
export type RenderEngine = "remotion" | "ffmpeg";
export type CenterBias = "left" | "center" | "right";
export type ZoomStrength = "low" | "medium" | "high";

export interface Highlight {
  id: string;
  title: string;
  reason: string;
  startTime: number;
  endTime: number;
  score: number;
  transcript: string;
  selected?: boolean;
}

export interface ClipResult {
  id: string;
  highlightId: string;
  title: string;
  startTime: number;
  endTime: number;
  status: "pending" | "processing" | "done" | "error" | string;
}

export interface JobState {
  id: string;
  status: string;
  progress: number;
  progressMessage: string;
  highlights: Highlight[];
  clips: ClipResult[];
  error: string | null;
}

export interface GenerateOptions {
  captionPreset: CaptionPreset;
  ctaText: string;
  renderEngine: RenderEngine;
  centerBias: CenterBias;
  zoomStrength: ZoomStrength;
}

export interface LibraryClipEntry extends ClipResult {
  jobId: string;
  captionPreset: CaptionPreset;
  renderEngine: RenderEngine;
  createdAt: number;
}

