import type { TranscriptWord } from "../types.js";
import { formatSrtTime } from "../utils.js";

interface SubtitleLine {
  index: number;
  start: number;
  end: number;
  text: string;
}

function assEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, " ");
}

function formatAssTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const cs = Math.floor((clamped - Math.floor(clamped)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

const EMPHASIS_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "from",
  "your",
  "you",
  "have",
  "just",
  "into",
  "about",
  "what",
  "when",
  "where",
  "will",
  "they",
  "them",
  "there",
  "because",
  "really",
  "very",
]);

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9']/g, "");
}

function scoreWordForEmphasis(raw: string): number {
  const token = normalizeToken(raw);
  if (!token || EMPHASIS_STOP_WORDS.has(token)) return -1;
  let score = token.length;
  if (/[!?]/.test(raw)) score += 3;
  if (/^[A-Z]{2,}$/.test(raw)) score += 2;
  return score;
}

function stylizeAssText(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  let bestIndex = -1;
  let bestScore = -1;
  for (let i = 0; i < words.length; i++) {
    const score = scoreWordForEmphasis(words[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return words
    .map((w, i) => {
      const escaped = assEscape(w);
      if (i !== bestIndex || bestScore < 4) return escaped;
      // Slightly highlight one impactful word per line for clearer visual hierarchy.
      return `{\\c&H004AD5FF&\\b1}${escaped}{\\rCaption}`;
    })
    .join(" ")
    .toUpperCase();
}

function buildLines(
  words: TranscriptWord[],
  clipStart: number,
  clipEnd: number,
  maxWords: number = 5,
  maxDuration: number = 1.8,
): SubtitleLine[] {
  const clipWords = words
    .filter((w) => w.end >= clipStart && w.start <= clipEnd)
    .sort((a, b) => a.start - b.start);

  if (clipWords.length === 0) return [];

  const lines: SubtitleLine[] = [];
  let currentLine: TranscriptWord[] = [];
  let lineStart = clipWords[0].start;

  for (const word of clipWords) {
    if (currentLine.length === 0) {
      // Anchor each new subtitle line to the first spoken word in that line.
      lineStart = word.start;
    }
    currentLine.push(word);

    const lineDuration = word.end - lineStart;
    const wordCount = currentLine.length;

    if (wordCount >= maxWords || lineDuration >= maxDuration) {
      const start = Math.max(0, lineStart - clipStart);
      const end = Math.max(start, Math.min(clipEnd, word.end) - clipStart);
      lines.push({
        index: lines.length + 1,
        start,
        end,
        text: currentLine.map((w) => w.word).join(" ").trim(),
      });
      currentLine = [];
    }
  }

  if (currentLine.length > 0) {
    const lineEnd = currentLine[currentLine.length - 1].end;
    const start = Math.max(0, lineStart - clipStart);
    const end = Math.max(start, Math.min(clipEnd, lineEnd) - clipStart);
    lines.push({
      index: lines.length + 1,
      start,
      end,
      text: currentLine.map((w) => w.word).join(" ").trim(),
    });
  }

  return lines;
}

export function generateSrt(
  words: TranscriptWord[],
  clipStart: number,
  clipEnd: number,
): string {
  const lines = buildLines(words, clipStart, clipEnd, 6, 2.5);
  if (lines.length === 0) return "";

  return lines
    .map(
      (l) =>
        `${l.index}\n${formatSrtTime(Math.max(0, l.start))} --> ${formatSrtTime(Math.max(Math.max(0, l.start) + 0.25, l.end))}\n${l.text}\n`,
    )
    .join("\n");
}

export function generateAss(
  words: TranscriptWord[],
  clipStart: number,
  clipEnd: number,
): string {
  const lines = buildLines(words, clipStart, clipEnd, 4, 1.5);
  if (lines.length === 0) return "";

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Arial,44,&H00FFFFFF,&H000000FF,&H00000000,&HA0000000,-1,0,0,0,100,100,0,0,1,3,1,2,90,90,140,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = lines
    .map((l) => {
      const start = formatAssTime(Math.max(0, l.start));
      const end = formatAssTime(Math.max(Math.max(0, l.start) + 0.3, l.end));
      const styled = stylizeAssText(l.text);
      return `Dialogue: 0,${start},${end},Caption,,0,0,0,,${styled}`;
    })
    .join("\n");

  return `${header}${events}\n`;
}
