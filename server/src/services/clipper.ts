import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";
import { jobDir } from "../utils.js";
import { generateSrt } from "./subtitles.js";
import type { TranscriptWord, ClipResult } from "../types.js";

export async function cutClip(
  videoPath: string,
  jobId: string,
  highlightId: string,
  title: string,
  startTime: number,
  endTime: number,
  words: TranscriptWord[],
  onProgress?: (msg: string) => void,
): Promise<ClipResult> {
  const clipId = uuid();
  const dir = jobDir(jobId);
  const rawClipPath = path.join(dir, `clip-${clipId}-raw.mp4`);
  const srtPath = path.join(dir, `clip-${clipId}.srt`);
  const finalClipPath = path.join(dir, `clip-${clipId}.mp4`);

  onProgress?.(`Cutting clip: ${title}...`);

  const srtContent = generateSrt(words, startTime, endTime);
  fs.writeFileSync(srtPath, srtContent, "utf-8");

  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .outputOptions(["-c", "copy", "-avoid_negative_ts", "1"])
      .output(rawClipPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`Clip cut failed: ${err.message}`)))
      .run();
  });

  if (srtContent.trim()) {
    onProgress?.(`Burning subtitles into: ${title}...`);
    await new Promise<void>((resolve, reject) => {
      const escapedSrtPath = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
      ffmpeg(rawClipPath)
        .videoFilters(
          `subtitles='${escapedSrtPath}':force_style='FontSize=24,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Alignment=2,MarginV=30'`,
        )
        .outputOptions(["-c:a", "copy"])
        .output(finalClipPath)
        .on("end", () => {
          fs.unlinkSync(rawClipPath);
          resolve();
        })
        .on("error", (err) => {
          if (fs.existsSync(rawClipPath)) {
            fs.renameSync(rawClipPath, finalClipPath);
          }
          console.error("Subtitle burn failed, using raw clip:", err.message);
          resolve();
        })
        .run();
    });
  } else {
    fs.renameSync(rawClipPath, finalClipPath);
  }

  return {
    id: clipId,
    highlightId,
    title,
    startTime,
    endTime,
    videoPath: finalClipPath,
    srtPath,
    status: "done",
  };
}
