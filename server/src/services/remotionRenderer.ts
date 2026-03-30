import path from "path";
import fs from "fs";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

type SrtCue = {
  start: number;
  end: number;
  text: string;
};

type RenderArgs = {
  inputVideoPath: string;
  outputVideoPath: string;
  srtPath: string;
  durationInFrames: number;
  durationSeconds: number;
  srcW: number;
  srcH: number;
  keyframes: Array<{ t: number; centerX: number; zoom: number }>;
  captionPreset?: "clean" | "bold" | "neon";
  ctaText?: string;
};

let serveUrlCache: string | null = null;

function parseTimecodeToSeconds(timecode: string): number {
  const [hms, ms] = timecode.split(",");
  const [hh, mm, ss] = hms.split(":").map(Number);
  return hh * 3600 + mm * 60 + ss + Number(ms) / 1000;
}

function parseSrt(content: string): SrtCue[] {
  const blocks = content.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const cues: SrtCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 2) continue;
    const timeLine = lines[1];
    const text = lines.slice(2).join(" ").trim();
    const match = timeLine.match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})/,
    );
    if (!match) continue;
    cues.push({
      start: parseTimecodeToSeconds(match[1]),
      end: parseTimecodeToSeconds(match[2]),
      text,
    });
  }
  return cues;
}

async function getServeUrl(): Promise<string> {
  if (serveUrlCache) return serveUrlCache;
  const entryPoint = path.resolve(process.cwd(), "remotion", "index.tsx");
  const bundled = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
  });
  serveUrlCache = bundled;
  return bundled;
}

export async function renderWithRemotion(args: RenderArgs): Promise<void> {
  const {
    inputVideoPath,
    outputVideoPath,
    srtPath,
    durationInFrames,
    durationSeconds,
    srcW,
    srcH,
    keyframes,
    captionPreset,
    ctaText,
  } = args;
  const srtContent = fs.existsSync(srtPath) ? fs.readFileSync(srtPath, "utf-8") : "";
  const cues = parseSrt(srtContent);
  const inputProps = {
    videoPath: `file://${inputVideoPath}`,
    cues,
    durationInFrames,
    durationSeconds,
    srcW,
    srcH,
    keyframes,
    captionPreset,
    ctaText,
  };

  const serveUrl = await getServeUrl();
  const composition = await selectComposition({
    serveUrl,
    id: "ClipVertical",
    inputProps,
  });

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outputVideoPath,
    inputProps,
    chromiumOptions: {
      gl: "angle",
    },
  });
}

