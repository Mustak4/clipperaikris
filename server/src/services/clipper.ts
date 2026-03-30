import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { v4 as uuid } from "uuid";
import { jobDir } from "../utils.js";
import { generateAss, generateSrt } from "./subtitles.js";
import type { TranscriptWord, ClipResult, RenderOptions } from "../types.js";

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

type SmartReframeTrack = {
  panStart: number;
  panEnd: number;
};

async function detectSmartReframeTrack(
  inputPath: string,
  srcW: number,
  cropW: number,
): Promise<SmartReframeTrack | null> {
  return new Promise((resolve) => {
    const ff = spawn("ffmpeg", [
      "-hide_banner",
      "-nostats",
      "-i",
      inputPath,
      "-vf",
      "fps=2,cropdetect=24:16:0",
      "-an",
      "-f",
      "null",
      "-",
    ]);

    let logs = "";
    ff.stderr.on("data", (chunk) => {
      logs += chunk.toString();
    });
    ff.on("error", () => resolve(null));
    ff.on("close", () => {
      const matches = Array.from(logs.matchAll(/crop=\d+:\d+:(\d+):(\d+)/g));
      if (matches.length < 4) return resolve(null);

      const centers = matches
        .map((m) => Number(m[1]))
        .filter((x) => Number.isFinite(x))
        .map((x) => x + cropW / 2)
        .sort((a, b) => a - b);

      if (centers.length === 0) return resolve(null);

      const pick = (q: number) =>
        centers[Math.max(0, Math.min(centers.length - 1, Math.floor((centers.length - 1) * q)))];

      const p20 = pick(0.2);
      const p80 = pick(0.8);
      const minCenter = cropW / 2;
      const maxCenter = srcW - cropW / 2;
      const clampCenter = (v: number) => Math.max(minCenter, Math.min(maxCenter, v));
      const startCenter = clampCenter(p20);
      const endCenter = clampCenter(p80);
      const maxPan = Math.max(0, srcW - cropW);
      const toX = (center: number) => Math.max(0, Math.min(maxPan, Math.round(center - cropW / 2)));

      resolve({
        panStart: toX(startCenter),
        panEnd: toX(endCenter),
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
  renderOptions: RenderOptions = {},
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
  const assContent = generateAss(
    words,
    startTime,
    endTime,
    renderOptions.captionPreset || "bold",
  );
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
  const outW = 720;
  const outH = 1280;
  const srcAR = srcW / srcH;
  const outAR = outW / outH;

  let smartTrack: SmartReframeTrack | null = null;
  if (srcAR > outAR + 0.05) {
    const cropH = srcH;
    const cropW = Math.round(cropH * (outW / outH));
    smartTrack = await detectSmartReframeTrack(rawClipPath, srcW, cropW);
  }

  onProgress?.(`Rendering vertical clip: ${title}...`);
  try {
    await new Promise<void>((resolve, reject) => {
    const escapedAssPath = assPath
      .replace(/\\/g, "/")
      .replace(/:/g, "\\:");

    const clipDuration = Math.max(0.1, endTime - startTime);
    const fadeDuration = Math.min(1, clipDuration / 2);
    const fadeOutStart = Math.max(0, clipDuration - fadeDuration);
    const ctaText = (renderOptions.ctaText || "FOLLOW FOR MORE").toUpperCase();
    const escapedCtaText = ctaText
      .replace(/\\/g, "\\\\")
      .replace(/:/g, "\\:")
      .replace(/'/g, "\\'")
      .replace(/,/g, "\\,");
    const ctaStart = Math.max(0, clipDuration - 1.15);

    // Determine the crop region from source. For a 16:9 source we take a
    // vertical strip; for already-vertical we keep the full frame.
    let filterChain: string;

    if (srcAR > outAR + 0.05) {
      // Source is wider than output (e.g. 16:9 → 9:16).
      // Apply a slow Ken Burns zoom + drift so it feels alive.
      const cropH = srcH;
      const cropW = Math.round(cropH * (outW / outH));
      const maxPanX = Math.max(0, srcW - cropW);
      let panStart = Math.round(maxPanX * 0.35);
      let panEnd = Math.round(maxPanX * 0.65);
      if (smartTrack) {
        panStart = smartTrack.panStart;
        panEnd = smartTrack.panEnd;
      }

      filterChain = [
        `crop=${cropW}:${cropH}:'${panStart}+t*(${panEnd}-${panStart})/${Math.max(1, endTime - startTime)}':0`,
        `scale=${outW}:${outH}`,
        "eq=contrast=1.07:brightness=0.015:saturation=1.12",
        "vignette=PI/7",
        `subtitles='${escapedAssPath}'`,
        `drawbox=x=0:y=h-210:w=w:h=210:color=black@0.38:t=fill:enable='gte(t,${ctaStart})'`,
        `drawtext=text='${escapedCtaText}':fontcolor=white:fontsize=38:x=(w-text_w)/2:y=h-130:enable='gte(t,${ctaStart})'`,
        `fade=t=in:st=0:d=${fadeDuration}`,
        `fade=t=out:st=${fadeOutStart}:d=${fadeDuration}`,
      ].join(",");
    } else {
      // Source is already vertical or close. Scale + pad.
      filterChain = [
        `scale=${outW}:${outH}:force_original_aspect_ratio=decrease`,
        `pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black`,
        "eq=contrast=1.06:brightness=0.012:saturation=1.1",
        "vignette=PI/8",
        `subtitles='${escapedAssPath}'`,
        `drawbox=x=0:y=h-210:w=w:h=210:color=black@0.38:t=fill:enable='gte(t,${ctaStart})'`,
        `drawtext=text='${escapedCtaText}':fontcolor=white:fontsize=38:x=(w-text_w)/2:y=h-130:enable='gte(t,${ctaStart})'`,
        `fade=t=in:st=0:d=${fadeDuration}`,
        `fade=t=out:st=${fadeOutStart}:d=${fadeDuration}`,
      ].join(",");
    }

    ffmpeg(rawClipPath)
      .videoFilters(filterChain)
      .audioFilters([
        `afade=t=in:st=0:d=${fadeDuration}`,
        `afade=t=out:st=${fadeOutStart}:d=${fadeDuration}`,
      ])
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
        reject(err);
      })
      .run();
    });
  } catch (primaryErr: any) {
    // Safety fallback: keep subtitles even if advanced effects fail.
    try {
      const escapedAssPath = assPath
        .replace(/\\/g, "/")
        .replace(/:/g, "\\:");

      await new Promise<void>((resolve, reject) => {
        ffmpeg(rawClipPath)
          .videoFilters([
            `scale=${outW}:${outH}:force_original_aspect_ratio=decrease`,
            `pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black`,
            `subtitles='${escapedAssPath}'`,
          ].join(","))
          .outputOptions([
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
          .output(finalClipPath)
          .on("end", () => {
            if (fs.existsSync(rawClipPath)) fs.unlinkSync(rawClipPath);
            resolve();
          })
          .on("error", (err) => reject(err))
          .run();
      });
    } catch (fallbackErr: any) {
      try {
        // Last safe attempt: still enforce vertical crop/pad + subtitles.
        const escapedAssPath = assPath
          .replace(/\\/g, "/")
          .replace(/:/g, "\\:");
        const srcAR = srcW / srcH;
        const outAR = outW / outH;

        let fallbackVideoFilter = "";
        if (srcAR > outAR + 0.05) {
          const cropH = srcH;
          const cropW = Math.round(cropH * (outW / outH));
          const maxPanX = Math.max(0, srcW - cropW);
          const panStart = smartTrack
            ? smartTrack.panStart
            : Math.round(maxPanX * 0.35);
          const panEnd = smartTrack ? smartTrack.panEnd : Math.round(maxPanX * 0.65);
          fallbackVideoFilter = [
            `crop=${cropW}:${cropH}:'${panStart}+t*(${panEnd}-${panStart})/${Math.max(1, endTime - startTime)}':0`,
            `scale=${outW}:${outH}`,
            `subtitles='${escapedAssPath}'`,
          ].join(",");
        } else {
          fallbackVideoFilter = [
            `scale=${outW}:${outH}:force_original_aspect_ratio=decrease`,
            `pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black`,
            `subtitles='${escapedAssPath}'`,
          ].join(",");
        }

        await new Promise<void>((resolve, reject) => {
          ffmpeg(rawClipPath)
            .videoFilters(fallbackVideoFilter)
            .outputOptions([
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
            .output(finalClipPath)
            .on("end", () => {
              if (fs.existsSync(rawClipPath)) fs.unlinkSync(rawClipPath);
              resolve();
            })
            .on("error", (err) => reject(err))
            .run();
        });
      } catch (lastErr: any) {
        if (fs.existsSync(rawClipPath)) {
          fs.renameSync(rawClipPath, finalClipPath);
        }
        console.error(
          "Vertical/caption render failed completely, using raw clip:",
          primaryErr?.message || primaryErr,
          "| fallback:",
          fallbackErr?.message || fallbackErr,
          "| last:",
          lastErr?.message || lastErr,
        );
      }
    }
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
