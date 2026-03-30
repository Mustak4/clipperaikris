import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import { jobDir } from "../utils.js";
import type { TranscriptSegment, TranscriptWord } from "../types.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

function getGroqKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set in .env");
  return key;
}

export async function extractAudio(
  videoPath: string,
  jobId: string,
  onProgress?: (msg: string) => void,
): Promise<string> {
  const dir = jobDir(jobId);
  const audioPath = path.join(dir, "audio.mp3");

  onProgress?.("Extracting audio from video...");

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioFrequency(16000)
      .audioChannels(1)
      .audioBitrate("64k")
      .format("mp3")
      .output(audioPath)
      .on("end", () => resolve(audioPath))
      .on("error", (err) => reject(new Error(`FFmpeg audio extraction failed: ${err.message}`)))
      .run();
  });
}

async function splitAudio(
  audioPath: string,
  jobId: string,
  maxSizeMB: number = 20,
): Promise<Array<{ path: string; startTime: number }>> {
  const stats = fs.statSync(audioPath);
  const sizeMB = stats.size / (1024 * 1024);

  if (sizeMB <= maxSizeMB) {
    return [{ path: audioPath, startTime: 0 }];
  }

  const dir = jobDir(jobId);
  const numChunks = Math.ceil(sizeMB / maxSizeMB);
  const duration = await getAudioDuration(audioPath);
  const chunkDuration = duration / numChunks;
  const chunks: Array<{ path: string; startTime: number }> = [];

  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkDuration;
    const chunkPath = path.join(dir, `audio-chunk-${i}.mp3`);
    const chunkDur =
      i === numChunks - 1 ? Math.max(0, duration - start) : chunkDuration;

    await new Promise<void>((resolve, reject) => {
      ffmpeg(audioPath)
        .setStartTime(start)
        .setDuration(chunkDur)
        .audioBitrate("64k")
        .format("mp3")
        .output(chunkPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    chunks.push({ path: chunkPath, startTime: start });
  }

  return chunks;
}

function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
}

async function transcribeWithGroq(
  audioFilePath: string,
): Promise<{ segments: any[]; words: any[] }> {
  const formData = new FormData();
  const audioBuffer = fs.readFileSync(audioFilePath);
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  formData.append("file", blob, path.basename(audioFilePath));
  formData.append("model", "whisper-large-v3");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "word");
  formData.append("timestamp_granularities[]", "segment");

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getGroqKey()}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq transcription failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return {
    segments: data.segments || [],
    words: data.words || [],
  };
}

export async function transcribeAudio(
  audioPath: string,
  jobId: string,
  onProgress?: (msg: string) => void,
): Promise<{ segments: TranscriptSegment[]; words: TranscriptWord[] }> {
  onProgress?.("Preparing audio for transcription...");

  const chunks = await splitAudio(audioPath, jobId);
  const allSegments: TranscriptSegment[] = [];
  const allWords: TranscriptWord[] = [];
  let segmentIndex = 0;

  for (let i = 0; i < chunks.length; i++) {
    const timeOffset = chunks[i].startTime;

    onProgress?.(
      chunks.length > 1
        ? `Transcribing audio chunk ${i + 1} of ${chunks.length}...`
        : "Transcribing audio with AI...",
    );

    const result = await transcribeWithGroq(chunks[i].path);

    for (const seg of result.segments) {
      const segStart = seg.start + timeOffset;
      const segEnd = seg.end + timeOffset;

      const segWords = (result.words as any[])
        .filter((w: any) => w.start >= seg.start && w.end <= seg.end)
        .map((w: any) => ({
          word: w.word,
          start: w.start + timeOffset,
          end: w.end + timeOffset,
        }));

      allSegments.push({
        id: `seg-${segmentIndex++}`,
        text: seg.text?.trim() || "",
        start: segStart,
        end: segEnd,
        words: segWords,
      });

      allWords.push(...segWords);
    }

    if (result.segments.length === 0 && result.words.length > 0) {
      for (const w of result.words) {
        allWords.push({
          word: w.word,
          start: w.start + timeOffset,
          end: w.end + timeOffset,
        });
      }
    }
  }

  if (allSegments.length === 0 && allWords.length > 0) {
    let currentSeg: TranscriptWord[] = [];
    let segStart = allWords[0].start;

    for (const w of allWords) {
      currentSeg.push(w);
      if (currentSeg.length >= 15 || w.end - segStart >= 10) {
        allSegments.push({
          id: `seg-${segmentIndex++}`,
          text: currentSeg.map((cw) => cw.word).join(" ").trim(),
          start: segStart,
          end: w.end,
          words: [...currentSeg],
        });
        currentSeg = [];
        segStart = w.end;
      }
    }

    if (currentSeg.length > 0) {
      allSegments.push({
        id: `seg-${segmentIndex++}`,
        text: currentSeg.map((cw) => cw.word).join(" ").trim(),
        start: segStart,
        end: currentSeg[currentSeg.length - 1].end,
        words: currentSeg,
      });
    }
  }

  return { segments: allSegments, words: allWords };
}
