import type { TranscriptWord } from "../types.js";
import { formatSrtTime } from "../utils.js";

interface SubtitleLine {
  index: number;
  start: number;
  end: number;
  text: string;
}

export function generateSrt(
  words: TranscriptWord[],
  clipStart: number,
  clipEnd: number,
): string {
  const clipWords = words.filter(
    (w) => w.start >= clipStart && w.end <= clipEnd,
  );

  if (clipWords.length === 0) return "";

  const lines: SubtitleLine[] = [];
  let currentLine: TranscriptWord[] = [];
  let lineStart = clipWords[0].start;

  for (const word of clipWords) {
    currentLine.push(word);

    const lineDuration = word.end - lineStart;
    const wordCount = currentLine.length;

    if (wordCount >= 10 || lineDuration >= 4.0) {
      lines.push({
        index: lines.length + 1,
        start: lineStart - clipStart,
        end: word.end - clipStart,
        text: currentLine.map((w) => w.word).join(" ").trim(),
      });
      currentLine = [];
      lineStart = word.end;
    }
  }

  if (currentLine.length > 0) {
    lines.push({
      index: lines.length + 1,
      start: lineStart - clipStart,
      end: currentLine[currentLine.length - 1].end - clipStart,
      text: currentLine.map((w) => w.word).join(" ").trim(),
    });
  }

  return lines
    .map(
      (l) =>
        `${l.index}\n${formatSrtTime(Math.max(0, l.start))} --> ${formatSrtTime(Math.max(0, l.end))}\n${l.text}\n`,
    )
    .join("\n");
}
