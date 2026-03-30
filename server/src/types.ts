export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  id: string;
  text: string;
  start: number;
  end: number;
  speaker?: string;
  words: TranscriptWord[];
}

export interface Highlight {
  id: string;
  title: string;
  reason: string;
  startTime: number;
  endTime: number;
  score: number;
  transcript: string;
}

export type CaptionPreset = "clean" | "bold" | "neon";

export interface RenderOptions {
  captionPreset?: CaptionPreset;
  ctaText?: string;
}

export interface ClipResult {
  id: string;
  highlightId: string;
  title: string;
  startTime: number;
  endTime: number;
  videoPath: string;
  srtPath: string;
  status: "pending" | "processing" | "done" | "error";
}

export type JobStatus =
  | "created"
  | "downloading"
  | "extracting_audio"
  | "transcribing"
  | "analyzing"
  | "highlights_ready"
  | "generating_clips"
  | "complete"
  | "error";

export interface Job {
  id: string;
  status: JobStatus;
  videoPath: string | null;
  audioPath: string | null;
  transcript: TranscriptSegment[];
  words: TranscriptWord[];
  highlights: Highlight[];
  clips: ClipResult[];
  error: string | null;
  progress: number;
  progressMessage: string;
  createdAt: number;
}
