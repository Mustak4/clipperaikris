import type {
  GenerateOptions,
  Highlight,
  JobState,
  ClipResult,
} from "@/types/jobs";

const API_BASE = "/api";

export async function createJob(input: {
  file?: File;
  youtubeUrl?: string;
}): Promise<{ jobId: string }> {
  if (input.file) {
    const formData = new FormData();
    formData.append("video", input.file);
    return request(`${API_BASE}/jobs`, {
      method: "POST",
      body: formData,
    });
  }

  return request(`${API_BASE}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ youtubeUrl: input.youtubeUrl }),
  });
}

export async function getJob(jobId: string): Promise<JobState> {
  return request(`${API_BASE}/jobs/${jobId}`);
}

export async function generateClips(
  jobId: string,
  clips: Highlight[],
  options: GenerateOptions,
): Promise<{ status: string }> {
  return request(`${API_BASE}/jobs/${jobId}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clips: clips.map((h) => ({
        highlightId: h.id,
        title: h.title,
        startTime: h.startTime,
        endTime: h.endTime,
      })),
      options,
    }),
  });
}

export function createJobEventSource(jobId: string) {
  return new EventSource(`${API_BASE}/jobs/${jobId}/events`);
}

export function clipVideoUrl(jobId: string, clipId: string) {
  return `${API_BASE}/jobs/${jobId}/clips/${clipId}`;
}

export function clipSrtUrl(jobId: string, clipId: string) {
  return `${API_BASE}/jobs/${jobId}/clips/${clipId}/srt`;
}

export type JobEventHandlers = {
  onStatus?: (payload: {
    status?: string;
    progress?: number;
    message?: string;
    error?: string;
  }) => void;
  onHighlightsReady?: (payload: { highlights: Highlight[] }) => void;
  onClipReady?: (payload: { clip: ClipResult }) => void;
  onComplete?: (payload: { clips?: ClipResult[] }) => void;
  onError?: (message: string) => void;
};

export function attachJobEventHandlers(es: EventSource, handlers: JobEventHandlers) {
  es.addEventListener("status", (e) => {
    handlers.onStatus?.(JSON.parse(e.data));
  });
  es.addEventListener("highlights_ready", (e) => {
    handlers.onHighlightsReady?.(JSON.parse(e.data));
  });
  es.addEventListener("clip_ready", (e) => {
    handlers.onClipReady?.(JSON.parse(e.data));
  });
  es.addEventListener("complete", (e) => {
    handlers.onComplete?.(JSON.parse(e.data));
  });
  es.addEventListener("error", (e: MessageEvent) => {
    try {
      const payload = JSON.parse(e.data);
      handlers.onError?.(payload.error || "SSE failed");
    } catch {
      handlers.onError?.("SSE failed");
    }
  });
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const error = await res.json();
      message = error.error || message;
    } catch {
      // ignore parse failure
    }
    throw new Error(message);
  }
  return res.json();
}

