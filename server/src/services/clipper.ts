import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { v4 as uuid } from "uuid";
import { jobDir } from "../utils.js";
import { generateAss, generateSrt } from "./subtitles.js";
import { renderWithRemotion } from "./remotionRenderer.js";
import { detectFaceTrack, type FaceTrackKeyframe } from "./faceTracker.js";
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
  panA: number;
  panB: number;
  panC: number;
};

type ReframeKeyframe = {
  t: number;
  centerX: number;
  zoom: number;
};

function getAnchorsFromFaces(
  faceTrack: FaceTrackKeyframe[],
  srcW: number,
  cropW: number,
): { panA: number; panB: number; panC: number } | null {
  if (faceTrack.length < 3) return null;
  const minCenter = cropW / 2;
  const maxCenter = srcW - cropW / 2;
  const clampCenter = (v: number) => Math.max(minCenter, Math.min(maxCenter, v));
  const maxPan = Math.max(0, srcW - cropW);
  const toPan = (center: number) =>
    Math.max(0, Math.min(maxPan, Math.round(center - cropW / 2)));

  const centers = faceTrack
    .map((f) => clampCenter(f.centerX))
    .sort((a, b) => a - b);

  const pick = (q: number) =>
    centers[
      Math.max(
        0,
        Math.min(centers.length - 1, Math.floor((centers.length - 1) * q)),
      )
    ];

  return {
    panA: toPan(pick(0.2)),
    panB: toPan(pick(0.5)),
    panC: toPan(pick(0.8)),
  };
}

function buildReframeKeyframes(
  srcW: number,
  srcH: number,
  clipDuration: number,
  track: SmartReframeTrack | null,
  faceTrack: FaceTrackKeyframe[],
): ReframeKeyframe[] {
  const outW = 1080;
  const outH = 1920;
  const cropW = Math.min(srcW, Math.round(srcH * (outW / outH)));
  const maxPanX = Math.max(0, srcW - cropW);
  const panA = track ? track.panA : Math.round(maxPanX * 0.25);
  const panB = track ? track.panB : Math.round(maxPanX * 0.5);
  const panC = track ? track.panC : Math.round(maxPanX * 0.75);
  const toCenter = (panX: number) =>
    Math.max(cropW / 2, Math.min(srcW - cropW / 2, panX + cropW / 2));

  if (faceTrack.length >= 3) {
    const frames = faceTrack
      .filter((f) => f.t <= clipDuration + 0.05)
      .slice(0, 36)
      .map((f) => ({
        t: Math.max(0, Math.min(clipDuration, f.t)),
        centerX: Math.max(cropW / 2, Math.min(srcW - cropW / 2, f.centerX)),
        // Smaller face in frame => zoom in more.
        zoom: Math.max(1.12, Math.min(1.45, 1.28 - Math.min(0.22, f.faceWidthRatio) * 0.55)),
      }));

    if (frames.length >= 2) {
      // Add fixed endpoints for interpolation stability.
      const first = frames[0];
      const last = frames[frames.length - 1];
      return [
        { t: 0, centerX: first.centerX, zoom: first.zoom },
        ...frames,
        { t: clipDuration, centerX: last.centerX, zoom: last.zoom },
      ];
    }
  }

  // Phase-2 multi-speaker framing:
  // hold -> move -> hold -> move to mimic active-speaker cuts.
  const d = Math.max(0.5, clipDuration);
  const t1 = Math.min(d * 0.22, 1.6);
  const t2 = Math.min(d * 0.46, 3.4);
  const t3 = Math.min(d * 0.7, 5.0);
  const t4 = Math.max(t3 + 0.2, d);

  return [
    { t: 0, centerX: toCenter(panA), zoom: 1.2 },
    { t: t1, centerX: toCenter(panA), zoom: 1.28 },
    { t: t2, centerX: toCenter(panB), zoom: 1.24 },
    { t: t3, centerX: toCenter(panC), zoom: 1.3 },
    { t: t4, centerX: toCenter(panC), zoom: 1.18 },
  ];
}

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
        .map((x) => x + cropW / 2);

      if (centers.length === 0) return resolve(null);

      const pick = (q: number) =>
        centers[
          Math.max(
            0,
            Math.min(centers.length - 1, Math.floor((centers.length - 1) * q)),
          )
        ];

      const p15 = pick(0.15);
      const p50 = pick(0.5);
      const p85 = pick(0.85);
      const minCenter = cropW / 2;
      const maxCenter = srcW - cropW / 2;
      const clampCenter = (v: number) => Math.max(minCenter, Math.min(maxCenter, v));
      const aCenter = clampCenter(p15);
      const bCenter = clampCenter(p50);
      const cCenter = clampCenter(p85);
      const maxPan = Math.max(0, srcW - cropW);
      const toX = (center: number) => Math.max(0, Math.min(maxPan, Math.round(center - cropW / 2)));

      resolve({
        panA: toX(aCenter),
        panB: toX(bCenter),
        panC: toX(cCenter),
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
  const outW = 1080;
  const outH = 1920;
  const srcAR = srcW / srcH;
  const outAR = outW / outH;

  let smartTrack: SmartReframeTrack | null = null;
  if (srcAR > outAR + 0.05) {
    const cropH = srcH;
    const cropW = Math.round(cropH * (outW / outH));
    smartTrack = await detectSmartReframeTrack(rawClipPath, srcW, cropW);
  }
  const clipDuration = Math.max(0.1, endTime - startTime);
  const faceTrack = await detectFaceTrack(rawClipPath, srcW);
  const reframeKeyframes = buildReframeKeyframes(
    srcW,
    srcH,
    clipDuration,
    smartTrack,
    faceTrack,
  );

  const preferRemotion = (renderOptions.renderEngine ?? "remotion") === "remotion";
  if (preferRemotion) {
    try {
      onProgress?.(`Rendering with Remotion: ${title}...`);
          const remotionFps = 25;
      await renderWithRemotion({
        inputVideoPath: rawClipPath,
        outputVideoPath: finalClipPath,
        srtPath,
            durationInFrames: Math.max(1, Math.ceil(clipDuration * remotionFps)),
            durationSeconds: clipDuration,
        srcW,
        srcH,
        keyframes: reframeKeyframes,
            captionPreset: renderOptions.captionPreset || "bold",
        // End-card CTA gets burned in with FFmpeg after Remotion renders.
        ctaText: "",
      });

      // Burn end-card CTA reliably (Remotion CTA has been unreliable in this setup).
      const ctaText = (renderOptions.ctaText || "Follow for more").toUpperCase();
      const escapedCtaText = ctaText
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\\'")
        .replace(/,/g, "\\,");
      const ctaStart = Math.max(0, clipDuration - 1.15);

      const ctaOutPath = finalClipPath.replace(/\.mp4$/, "-cta.mp4");
      await new Promise<void>((resolve, reject) => {
        ffmpeg(finalClipPath)
          .videoFilters([
            `drawbox=x=0:y=h-210:w=iw:h=210:color=black@0.38:t=fill:enable='gte(t,${ctaStart})'`,
            `drawtext=text='${escapedCtaText}':fontcolor=white:fontsize=54:x=(w-text_w)/2:y=h-130:enable='gte(t,${ctaStart})'`,
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
            "copy",
            "-movflags",
            "+faststart",
          ])
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .save(ctaOutPath);
      });

      // Replace final output with CTA version.
      if (fs.existsSync(ctaOutPath)) {
        if (fs.existsSync(finalClipPath)) fs.unlinkSync(finalClipPath);
        fs.renameSync(ctaOutPath, finalClipPath);
      }

      if (fs.existsSync(rawClipPath)) fs.unlinkSync(rawClipPath);
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
    } catch (remotionErr: any) {
      // Fall back to ffmpeg render path when Remotion is unavailable at runtime.
      console.error("Remotion render failed, falling back to ffmpeg:", remotionErr?.message || remotionErr);
    }
  }

  onProgress?.(`Rendering vertical clip: ${title}...`);
  try {
    await new Promise<void>((resolve, reject) => {
    const escapedAssPath = assPath
      .replace(/\\/g, "/")
      .replace(/:/g, "\\:");

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
      // Keep speaker framing closer to center and avoid corner-locking.
      const cropH = srcH;
      const cropW = Math.round(cropH * (outW / outH));
      const maxPanX = Math.max(0, srcW - cropW);
      let panA = Math.round(maxPanX * 0.25);
      let panB = Math.round(maxPanX * 0.5);
      let panC = Math.round(maxPanX * 0.75);
      const faceAnchors = getAnchorsFromFaces(faceTrack, srcW, cropW);
      if (faceAnchors) {
        panA = faceAnchors.panA;
        panB = faceAnchors.panB;
        panC = faceAnchors.panC;
      } else if (smartTrack) {
        panA = smartTrack.panA;
        panB = smartTrack.panB;
        panC = smartTrack.panC;
      }
      // Clamp pan spread so framing does not stick to extreme corners.
      const maxDelta = Math.round(maxPanX * 0.34);
      const clampAround = (base: number, target: number) =>
        Math.max(0, Math.min(maxPanX, Math.max(base - maxDelta, Math.min(base + maxDelta, target))));
      panA = clampAround(panB, panA);
      panC = clampAround(panB, panC);

      const d = Math.max(1, endTime - startTime);
      const seg1 = Math.max(0.01, d * 0.35);
      const seg2 = Math.max(seg1 + 0.01, d * 0.7);

      filterChain = [
        // Three-stage pan simulates speaker-to-speaker framing instead of static center crop.
        `crop=${cropW}:${cropH}:'if(lt(t,${seg1}),${panA}+t*(${panB}-${panA})/${seg1},if(lt(t,${seg2}),${panB}+(t-${seg1})*(${panC}-${panB})/${Math.max(0.01, seg2 - seg1)},${panC}))':0`,
        `scale=${outW}:${outH}`,
        "eq=contrast=1.06:brightness=0.012:saturation=1.1",
        `subtitles='${escapedAssPath}'`,
        `drawbox=x=0:y=h-210:w=iw:h=210:color=black@0.38:t=fill:enable='gte(t,${ctaStart})'`,
        `drawtext=text='${escapedCtaText}':fontcolor=white:fontsize=50:x=(w-text_w)/2:y=h-130:enable='gte(t,${ctaStart})'`,
        `fade=t=in:st=0:d=${fadeDuration}`,
        `fade=t=out:st=${fadeOutStart}:d=${fadeDuration}`,
      ].join(",");
    } else {
      // Source is already vertical or close. Scale + pad.
      filterChain = [
        `scale=${outW}:${outH}:force_original_aspect_ratio=decrease`,
        `pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black`,
        "eq=contrast=1.05:brightness=0.01:saturation=1.08",
        `subtitles='${escapedAssPath}'`,
        `drawbox=x=0:y=h-210:w=iw:h=210:color=black@0.38:t=fill:enable='gte(t,${ctaStart})'`,
        `drawtext=text='${escapedCtaText}':fontcolor=white:fontsize=50:x=(w-text_w)/2:y=h-130:enable='gte(t,${ctaStart})'`,
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
          const panA = smartTrack ? smartTrack.panA : Math.round(maxPanX * 0.25);
          const panB = smartTrack ? smartTrack.panB : Math.round(maxPanX * 0.5);
          const panC = smartTrack ? smartTrack.panC : Math.round(maxPanX * 0.75);
          const d = Math.max(1, endTime - startTime);
          const seg1 = Math.max(0.01, d * 0.35);
          const seg2 = Math.max(seg1 + 0.01, d * 0.7);
          fallbackVideoFilter = [
            `crop=${cropW}:${cropH}:'if(lt(t,${seg1}),${panA}+t*(${panB}-${panA})/${seg1},if(lt(t,${seg2}),${panB}+(t-${seg1})*(${panC}-${panB})/${Math.max(0.01, seg2 - seg1)},${panC}))':0`,
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
