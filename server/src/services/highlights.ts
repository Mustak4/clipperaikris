import OpenAI from "openai";
import { v4 as uuid } from "uuid";
import type { TranscriptSegment, Highlight } from "../types.js";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }
  return _openai;
}

function chunkSegments(
  segments: TranscriptSegment[],
  maxDurationSec: number = 300,
  overlapSec: number = 30,
): TranscriptSegment[][] {
  const chunks: TranscriptSegment[][] = [];
  let chunkStart = 0;
  let currentChunk: TranscriptSegment[] = [];

  for (const seg of segments) {
    if (seg.start - chunkStart >= maxDurationSec && currentChunk.length > 0) {
      chunks.push(currentChunk);
      const overlapStart = seg.start - overlapSec;
      currentChunk = currentChunk.filter((s) => s.start >= overlapStart);
      chunkStart = currentChunk.length > 0 ? currentChunk[0].start : seg.start;
    }
    currentChunk.push(seg);
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function buildPrompt(segments: TranscriptSegment[]): string {
  const transcript = segments
    .map((s) => `[${fmtTime(s.start)} - ${fmtTime(s.end)}] ${s.text}`)
    .join("\n");

  return `You are an expert video editor who identifies the most engaging, shareable moments in video content.

Analyze this transcript and find the most compelling moments that would make great short-form clips (15-30 seconds each) for TikTok/Reels/YouTube Shorts. Look for:

- Emotional peaks (excitement, surprise, laughter, passion)
- Hot takes, controversial or bold statements
- Key insights or "aha" moments
- Funny moments or great storytelling
- Dramatic reveals or surprising information
- Quotable, punchy statements
- Heated debates or arguments
- Strong hooks that make someone keep watching (\"wait\", \"here's the trick\", \"most people get this wrong\", etc.)

For each highlight, rate its engagement potential from 1-10.

Transcript:
${transcript}

Return ONLY a JSON array (no markdown, no explanation) with this exact format:
[
  {
    "title": "Short catchy title for the clip",
    "reason": "Why this moment is engaging",
    "startTime": 0.0,
    "endTime": 30.0,
    "score": 9
  }
]

Rules:
- Each clip MUST be 15-30 seconds long
- Prefer 6-10 highlights if possible
- startTime and endTime are in seconds (decimal)
- Only include moments scoring 6 or higher
- Avoid intros/outros, sponsor reads, housekeeping, \"like/subscribe\" segments
- Prefer moments with a clear point + payoff inside the window
- Don't overlap clips unless they're distinct moments
- Return valid JSON only`;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function mergeHighlights(highlights: Highlight[]): Highlight[] {
  if (highlights.length <= 1) return highlights;

  const sorted = [...highlights].sort((a, b) => a.startTime - b.startTime);
  const merged: Highlight[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];

    if (curr.startTime < prev.endTime - 2) {
      if (curr.score > prev.score) {
        merged[merged.length - 1] = curr;
      }
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

function getTimelineBounds(segments: TranscriptSegment[]): { minStart: number; maxEnd: number } {
  if (segments.length === 0) return { minStart: 0, maxEnd: 0 };
  return {
    minStart: segments[0].start,
    maxEnd: segments[segments.length - 1].end,
  };
}

function clampRange(start: number, end: number, min: number, max: number): { start: number; end: number } {
  let s = Math.max(min, start);
  let e = Math.min(max, end);
  if (e < s) {
    const mid = (s + e) / 2 || s;
    s = Math.max(min, mid - 7.5);
    e = Math.min(max, mid + 7.5);
  }
  return { start: s, end: e };
}

function expandToDuration(
  start: number,
  end: number,
  minDuration: number,
  maxDuration: number,
  minTimeline: number,
  maxTimeline: number,
): { start: number; end: number } {
  let s = start;
  let e = end;
  let duration = e - s;

  if (duration < minDuration) {
    const extra = minDuration - duration;
    s -= extra / 2;
    e += extra / 2;
  } else if (duration > maxDuration) {
    const center = (s + e) / 2;
    s = center - maxDuration / 2;
    e = center + maxDuration / 2;
  }

  ({ start: s, end: e } = clampRange(s, e, minTimeline, maxTimeline));
  duration = e - s;

  // If still too short because of timeline boundaries, push window to fit min duration.
  if (duration < minDuration) {
    if (s <= minTimeline) {
      e = Math.min(maxTimeline, s + minDuration);
    } else if (e >= maxTimeline) {
      s = Math.max(minTimeline, e - minDuration);
    }
  }

  ({ start: s, end: e } = clampRange(s, e, minTimeline, maxTimeline));
  return { start: s, end: e };
}

function normalizeHighlight(
  raw: any,
  chunkSegments: TranscriptSegment[],
  allSegments: TranscriptSegment[],
): Highlight | null {
  const title = typeof raw?.title === "string" ? raw.title.trim() : "";
  const reason = typeof raw?.reason === "string" ? raw.reason.trim() : "";
  const score = Math.min(10, Math.max(1, Number(raw?.score) || 5));
  const parsedStart = Number(raw?.startTime);
  const parsedEnd = Number(raw?.endTime);

  if (!Number.isFinite(parsedStart) || !Number.isFinite(parsedEnd)) return null;

  const { minStart, maxEnd } = getTimelineBounds(allSegments);
  let { start, end } = clampRange(parsedStart, parsedEnd, minStart, maxEnd);

  // Enforce product requirement: 15-30 seconds.
  ({ start, end } = expandToDuration(start, end, 15, 30, minStart, maxEnd));

  const transcript = allSegments
    .filter((s) => s.end >= start && s.start <= end)
    .map((s) => s.text)
    .join(" ")
    .trim();

  // Fallback to chunk-local transcript if global lookup is sparse.
  const fallbackTranscript = chunkSegments
    .filter((s) => s.end >= start && s.start <= end)
    .map((s) => s.text)
    .join(" ")
    .trim();

  return {
    id: uuid(),
    title: title || "Untitled Highlight",
    reason,
    startTime: start,
    endTime: end,
    score,
    transcript: transcript || fallbackTranscript || title || "Highlight moment",
  };
}

export async function detectHighlights(
  segments: TranscriptSegment[],
  onProgress?: (msg: string) => void,
): Promise<Highlight[]> {
  onProgress?.("Analyzing transcript for engaging moments...");

  const chunks = chunkSegments(segments);
  const allHighlights: Highlight[] = [];

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(
      `Analyzing section ${i + 1} of ${chunks.length}...`,
    );

    const prompt = buildPrompt(chunks[i]);

    const response = await getOpenAI().chat.completions.create({
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || "[]";

    try {
      const cleaned = content.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      if (Array.isArray(parsed)) {
        for (const h of parsed) {
          const normalized = normalizeHighlight(h, chunks[i], segments);
          if (!normalized) continue;
          allHighlights.push(normalized);
        }
      }
    } catch (err) {
      console.error("Failed to parse highlights from chunk", i, err);
    }
  }

  const merged = mergeHighlights(allHighlights);
  const ranked = merged.sort((a, b) => b.score - a.score);

  // Ensure a minimum of 5 clips, even if the model returns too few.
  if (ranked.length < 5) {
    const { minStart, maxEnd } = getTimelineBounds(segments);
    const span = Math.max(0, maxEnd - minStart);
    const desired = 5;
    const window = 22; // seconds
    const step = span > window ? (span - window) / Math.max(1, desired - 1) : 0;
    for (let i = ranked.length; i < desired; i++) {
      const s = minStart + i * step;
      const { start, end } = expandToDuration(s, s + window, 15, 30, minStart, maxEnd);
      const transcript = segments
        .filter((seg) => seg.end >= start && seg.start <= end)
        .map((seg) => seg.text)
        .join(" ")
        .trim();
      ranked.push({
        id: uuid(),
        title: `Moment ${i + 1}`,
        reason: "Fallback highlight (model returned too few).",
        startTime: start,
        endTime: end,
        score: 6,
        transcript: transcript || "Highlight moment",
      });
    }
  }

  return ranked.slice(0, 12);
}
