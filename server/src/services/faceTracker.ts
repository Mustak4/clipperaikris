import fs from "fs";
import path from "path";
import { spawn } from "child_process";

export type FaceTrackKeyframe = {
  t: number;
  centerX: number;
  faceWidthRatio: number;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export async function detectFaceTrack(
  videoPath: string,
  srcW: number,
): Promise<FaceTrackKeyframe[]> {
  const scriptPath = path.resolve(process.cwd(), "scripts", "face_track.py");
  if (!fs.existsSync(scriptPath)) return [];

  const pythonCmd = process.env.PYTHON_CMD ?? "py";

  return new Promise((resolve) => {
    const proc = spawn(pythonCmd, [scriptPath, "--video", videoPath, "--fps", "2"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", () => resolve([]));
    proc.on("close", () => {
      try {
        const parsed = JSON.parse(stdout || "{}") as {
          keyframes?: Array<{ t: number; centerX: number; faceWidthRatio?: number }>;
        };
        const frames = (parsed.keyframes ?? [])
          .filter((k) => Number.isFinite(k.t) && Number.isFinite(k.centerX))
          .map((k) => ({
            t: Math.max(0, k.t),
            centerX: clamp(k.centerX, 0, srcW),
            faceWidthRatio: clamp(k.faceWidthRatio ?? 0.18, 0.04, 0.8),
          }))
          .sort((a, b) => a.t - b.t);

        if (frames.length <= 1) return resolve(frames);

        // Smooth jitter so camera motion feels intentional, not shaky.
        const smoothed: FaceTrackKeyframe[] = [];
        for (let i = 0; i < frames.length; i++) {
          const p = frames[Math.max(0, i - 1)];
          const c = frames[i];
          const n = frames[Math.min(frames.length - 1, i + 1)];
          smoothed.push({
            t: c.t,
            centerX: (p.centerX + c.centerX + n.centerX) / 3,
            faceWidthRatio: (p.faceWidthRatio + c.faceWidthRatio + n.faceWidthRatio) / 3,
          });
        }
        resolve(smoothed);
      } catch {
        if (stderr.trim()) {
          console.error("[face-tracker]", stderr.trim());
        }
        resolve([]);
      }
    });
  });
}

