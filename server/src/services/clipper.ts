import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";
import { jobDir } from "../utils.js";
import { generateAss, generateSrt } from "./subtitles.js";
import type { TranscriptWord, ClipResult } from "../types.js";

function getVideoDimensions(
  filePath: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const video = metadata.streams.find((s) => s.codec_type === "video");
      resolve({
        width: video?.width || 1920,
        height: video?.height || 1080,
      });
    });
  });
}

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
  const assPath = path.join(dir, `clip-${clipId}.ass`);
  const finalClipPath = path.join(dir, `clip-${clipId}.mp4`);

  onProgress?.(`Cutting clip: ${title}...`);

  const srtContent = generateSrt(words, startTime, endTime);
  const assContent = generateAss(words, startTime, endTime);
  fs.writeFileSync(srtPath, srtContent, "utf-8");
  fs.writeFileSync(assPath, assContent, "utf-8");

  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .outputOptions([
        // Re-encode for sample-accurate trimming; stream copy can shift clip start to keyframes.
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
      ])
      .output(rawClipPath)
      .on("end", () => resolve())
      .on("error", (err) =>
        reject(new Error(`Clip cut failed: ${err.message}`)),
      )
      .run();
  });

  const { width: srcW, height: srcH } = await getVideoDimensions(rawClipPath);

  onProgress?.(`Rendering vertical clip: ${title}...`);
  await new Promise<void>((resolve) => {
    const escapedAssPath = assPath
      .replace(/\\/g, "/")
      .replace(/:/g, "\\:");

    const outW = 720;
    const outH = 1280;

    // Determine the crop region from source. For a 16:9 source we take a
    // vertical strip; for already-vertical we keep the full frame.
    const srcAR = srcW / srcH;
    const outAR = outW / outH;

    let filterChain: string;

    if (srcAR > outAR + 0.05) {
      // Source is wider than output (e.g. 16:9 → 9:16).
      // Apply a slow Ken Burns zoom + drift so it feels alive.
      const cropH = srcH;
      const cropW = Math.round(cropH * (outW / outH));
      const maxPanX = Math.max(0, srcW - cropW);
      const panStart = Math.round(maxPanX * 0.35);
      const panEnd = Math.round(maxPanX * 0.65);

      filterChain = [
        `crop=${cropW}:${cropH}:'${panStart}+t*(${panEnd}-${panStart})/${Math.max(1, endTime - startTime)}':0`,
        `scale=${outW}:${outH}`,
        `subtitles='${escapedAssPath}'`,
      ].join(",");
    } else {
      // Source is already vertical or close. Scale + pad.
      filterChain = [
        `scale=${outW}:${outH}:force_original_aspect_ratio=decrease`,
        `pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black`,
        `subtitles='${escapedAssPath}'`,
      ].join(",");
    }

    ffmpeg(rawClipPath)
      .videoFilters(filterChain)
      .outputOptions([
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
      ])
      .output(finalClipPath)
      .on("end", () => {
        if (fs.existsSync(rawClipPath)) fs.unlinkSync(rawClipPath);
        resolve();
      })
      .on("error", (err) => {
        if (fs.existsSync(rawClipPath)) {
          fs.renameSync(rawClipPath, finalClipPath);
        }
        console.error(
          "Vertical/caption render failed, using raw clip:",
          err.message,
        );
        resolve();
      })
      .run();
  });

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
