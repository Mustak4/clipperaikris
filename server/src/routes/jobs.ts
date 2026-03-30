import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";
import { jobDir } from "../utils.js";
import { downloadYouTube } from "../services/youtube.js";
import { extractAudio, transcribeAudio } from "../services/transcription.js";
import { detectHighlights } from "../services/highlights.js";
import { cutClip } from "../services/clipper.js";
import type { Job, CaptionPreset, RenderOptions } from "../types.js";

const router = Router();

function paramId(req: Request): string {
  return req.params.id as string;
}

function paramClipId(req: Request): string {
  return req.params.clipId as string;
}

const jobs = new Map<string, Job>();
const sseClients = new Map<string, Set<Response>>();

const upload = multer({
  dest: path.resolve(process.cwd(), "..", "tmp", "uploads"),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
});

function sendSSE(jobId: string, event: string, data: any) {
  const clients = sseClients.get(jobId);
  if (!clients) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(msg);
  }
}

function updateJob(jobId: string, updates: Partial<Job>) {
  const job = jobs.get(jobId);
  if (!job) return;
  Object.assign(job, updates);
  sendSSE(jobId, "status", {
    status: job.status,
    progress: job.progress,
    message: job.status === "error" ? (job.error || job.progressMessage) : job.progressMessage,
    error: job.error,
  });
  if (job.status === "error") {
    sendSSE(jobId, "error", { error: job.error || "Unknown error" });
  }
}

const HOOK_FILLER_WORDS = new Set([
  "so",
  "okay",
  "ok",
  "well",
  "um",
  "uh",
  "like",
  "you",
  "know",
  "today",
  "guys",
  "hey",
  "hello",
  "welcome",
  "basically",
  "actually",
  "literally",
  "right",
  "just",
]);

function normalizeWordToken(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9']/g, "");
}

function computeHookShiftSeconds(
  words: Job["words"],
  startTime: number,
  endTime: number,
): number {
  const scanEnd = Math.min(endTime, startTime + 2.5);
  const headWords = words.filter((w) => w.start >= startTime && w.start <= scanEnd);
  if (headWords.length === 0) return 0;

  const candidate = headWords.find((w) => {
    const token = normalizeWordToken(w.word);
    if (!token || HOOK_FILLER_WORDS.has(token)) return false;
    if (token.length >= 6) return true;
    return /\d/.test(token) || /[!?]/.test(w.word);
  });

  if (!candidate) return 0;
  const shift = candidate.start - startTime;
  return Math.max(0, Math.min(1.5, shift));
}

// POST /api/jobs — Create a new job (file upload or YouTube URL)
router.post("/", upload.single("video"), async (req: Request, res: Response) => {
  const jobId = uuid();
  const dir = jobDir(jobId);

  const job: Job = {
    id: jobId,
    status: "created",
    videoPath: null,
    audioPath: null,
    transcript: [],
    words: [],
    highlights: [],
    clips: [],
    error: null,
    progress: 0,
    progressMessage: "",
    createdAt: Date.now(),
  };

  jobs.set(jobId, job);

  res.json({ jobId });

  processJob(jobId, req.file, req.body.youtubeUrl).catch((err) => {
    console.error(`Job ${jobId} failed:`, err);
    updateJob(jobId, {
      status: "error",
      error: err.message || "Unknown error",
      progressMessage: "Failed",
    });
  });
});

async function processJob(
  jobId: string,
  file: Express.Multer.File | undefined,
  youtubeUrl: string | undefined,
) {
  const progressCb = (msg: string) => {
    updateJob(jobId, { progressMessage: msg });
  };

  let videoPath: string;

  if (file) {
    const dir = jobDir(jobId);
    const ext = path.extname(file.originalname) || ".mp4";
    videoPath = path.join(dir, `source${ext}`);
    fs.renameSync(file.path, videoPath);
    updateJob(jobId, { status: "extracting_audio", videoPath, progress: 10 });
  } else if (youtubeUrl) {
    updateJob(jobId, { status: "downloading", progress: 5, progressMessage: "Downloading video..." });
    videoPath = await downloadYouTube(youtubeUrl, jobId, (pct, msg) => {
      updateJob(jobId, { progress: Math.min(25, 5 + pct * 0.2), progressMessage: msg });
    });
    updateJob(jobId, { status: "extracting_audio", videoPath, progress: 25 });
  } else {
    throw new Error("No video file or YouTube URL provided");
  }

  updateJob(jobId, { videoPath });

  const audioPath = await extractAudio(videoPath, jobId, progressCb);
  updateJob(jobId, { audioPath, status: "transcribing", progress: 35, progressMessage: "Transcribing audio..." });

  const { segments, words } = await transcribeAudio(audioPath, jobId, progressCb);
  updateJob(jobId, {
    transcript: segments,
    words,
    status: "analyzing",
    progress: 60,
    progressMessage: "Analyzing for highlights...",
  });

  const highlights = await detectHighlights(segments, progressCb);
  updateJob(jobId, {
    highlights,
    status: "highlights_ready",
    progress: 80,
    progressMessage: "Highlights ready! Select clips to generate.",
  });

  sendSSE(jobId, "highlights_ready", { highlights });
}

// GET /api/jobs/:id/events — SSE stream
router.get("/:id/events", (req: Request, res: Response) => {
  const jobId = paramId(req);
  const job = jobs.get(jobId);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  res.write(`event: status\ndata: ${JSON.stringify({
    status: job.status,
    progress: job.progress,
    message: job.progressMessage,
  })}\n\n`);

  if (job.highlights.length > 0) {
    res.write(`event: highlights_ready\ndata: ${JSON.stringify({ highlights: job.highlights })}\n\n`);
  }

  if (!sseClients.has(jobId)) {
    sseClients.set(jobId, new Set());
  }
  sseClients.get(jobId)!.add(res);

  req.on("close", () => {
    sseClients.get(jobId)?.delete(res);
  });
});

// GET /api/jobs/:id — Get job state
router.get("/:id", (req: Request, res: Response) => {
  const job = jobs.get(paramId(req));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    progressMessage: job.progressMessage,
    transcript: job.transcript,
    highlights: job.highlights,
    clips: job.clips.map((c) => ({
      id: c.id,
      highlightId: c.highlightId,
      title: c.title,
      startTime: c.startTime,
      endTime: c.endTime,
      status: c.status,
    })),
    error: job.error,
  });
});

// POST /api/jobs/:id/generate — Generate selected clips
router.post("/:id/generate", async (req: Request, res: Response) => {
  const id = paramId(req);
  const job = jobs.get(id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (!job.videoPath) {
    res.status(400).json({ error: "No video available" });
    return;
  }

  const { clips } = req.body as {
    clips: Array<{ highlightId: string; title: string; startTime: number; endTime: number }>;
    options?: RenderOptions;
  };
  const renderOptions: RenderOptions = {
    captionPreset: ((req.body?.options?.captionPreset as CaptionPreset) || "bold"),
    ctaText:
      typeof req.body?.options?.ctaText === "string" ? req.body.options.ctaText : "Follow for more",
    renderEngine:
      req.body?.options?.renderEngine === "ffmpeg" ? "ffmpeg" : "remotion",
    centerBias:
      req.body?.options?.centerBias === "left" || req.body?.options?.centerBias === "right"
        ? req.body.options.centerBias
        : "center",
    zoomStrength:
      req.body?.options?.zoomStrength === "low" || req.body?.options?.zoomStrength === "high"
        ? req.body.options.zoomStrength
        : "medium",
  };

  if (!clips || clips.length === 0) {
    res.status(400).json({ error: "No clips selected" });
    return;
  }

  res.json({ status: "generating" });

  updateJob(id, {
    status: "generating_clips",
    progress: 85,
    progressMessage: `Generating ${clips.length} clip(s)...`,
  });

  try {
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      // Keep generated clips in a useful short-form range.
      const minDuration = 15;
      const maxDuration = 30;
      let startTime = Number(c.startTime);
      let endTime = Number(c.endTime);
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
        throw new Error(`Invalid clip times for "${c.title}"`);
      }
      let duration = endTime - startTime;
      if (duration < minDuration) {
        const extra = minDuration - duration;
        startTime = Math.max(0, startTime - extra / 2);
        endTime = startTime + minDuration;
      } else if (duration > maxDuration) {
        endTime = startTime + maxDuration;
      }

      // Recut opening beat to skip low-energy filler and land faster on the first hook.
      const hookShift = computeHookShiftSeconds(job.words, startTime, endTime);
      startTime += hookShift;

      updateJob(id, {
        progressMessage: `Generating clip ${i + 1} of ${clips.length}: ${c.title}`,
        progress: 85 + (i / clips.length) * 14,
      });

      try {
        const result = await cutClip(
          job.videoPath,
          job.id,
          c.highlightId,
          c.title,
          startTime,
          endTime,
          job.words,
          renderOptions,
          (msg) => updateJob(id, { progressMessage: msg }),
        );

        job.clips.push(result);
        sendSSE(id, "clip_ready", {
          clip: {
            id: result.id,
            highlightId: result.highlightId,
            title: result.title,
            startTime: result.startTime,
            endTime: result.endTime,
            status: result.status,
          },
        });
      } catch (clipErr: any) {
        const msg = clipErr?.message || "Clip render failed";
        console.error("Clip generation failed:", msg);
        sendSSE(id, "clip_ready", {
          clip: {
            id: `error-${i}`,
            highlightId: c.highlightId,
            title: c.title,
            startTime,
            endTime,
            status: "error",
          },
        });
        // Continue generating remaining clips instead of aborting the whole job.
        continue;
      }
    }

    updateJob(id, {
      status: "complete",
      progress: 100,
      progressMessage: "All clips generated!",
    });

    sendSSE(id, "complete", { clips: job.clips.map(c => ({
      id: c.id,
      title: c.title,
      startTime: c.startTime,
      endTime: c.endTime,
      status: c.status,
    }))});
  } catch (err: any) {
    updateJob(id, {
      status: "error",
      error: err.message || "Clip generation failed",
    });
  }
});

// GET /api/jobs/:id/clips/:clipId — Serve clip file
router.get("/:id/clips/:clipId", (req: Request, res: Response) => {
  const job = jobs.get(paramId(req));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const clip = job.clips.find((c) => c.id === paramClipId(req));
  if (!clip) {
    res.status(404).json({ error: "Clip not found" });
    return;
  }

  if (!fs.existsSync(clip.videoPath)) {
    res.status(404).json({ error: "Clip file not found on disk" });
    return;
  }

  res.sendFile(clip.videoPath);
});

// GET /api/jobs/:id/clips/:clipId/srt — Serve SRT file
router.get("/:id/clips/:clipId/srt", (req: Request, res: Response) => {
  const job = jobs.get(paramId(req));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const clip = job.clips.find((c) => c.id === paramClipId(req));
  if (!clip) {
    res.status(404).json({ error: "Clip not found" });
    return;
  }

  if (!fs.existsSync(clip.srtPath)) {
    res.status(404).json({ error: "SRT file not found" });
    return;
  }

  res.setHeader("Content-Type", "text/plain");
  res.sendFile(clip.srtPath);
});

export default router;
