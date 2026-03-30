import { execFile, spawn } from "child_process";
import path from "path";
import fs from "fs";
import { jobDir } from "../utils.js";

export async function downloadYouTube(
  url: string,
  jobId: string,
  onProgress?: (pct: number, msg: string) => void,
): Promise<string> {
  const dir = jobDir(jobId);
  const outputTemplate = path.join(dir, "source.%(ext)s");

  return new Promise((resolve, reject) => {
    const args = [
      // Prefer higher quality to reduce vertical upscale artifacts.
      "-f",
      "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
      // Prefer H.264 where possible for compatibility.
      "-S",
      "res:1080,fps,codec:h264",
      "--js-runtimes", "deno",
      "--remote-components", "ejs:github",
      "-N", "4",
      "--merge-output-format", "mp4",
      "-o", outputTemplate,
      "--no-playlist",
      "--newline",
      "--cookies-from-browser", "brave",
      url,
    ];

    const proc = spawn("yt-dlp", args);

    let lastPct = 0;

    proc.stdout.on("data", (data: Buffer) => {
      const line = data.toString();
      // yt-dlp emits lines like: "[download]  12.3% of ..."
      const match = line.match(/\[download\]\s+(\d+\.?\d*)%/);
      if (match) {
        const pct = parseFloat(match[1]);
        if (pct > lastPct) {
          lastPct = pct;
          onProgress?.(pct, `Downloading video: ${pct.toFixed(1)}%`);
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      console.error("[yt-dlp]", data.toString());
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp exited with code ${code}`));
      }
      const files = fs.readdirSync(dir).filter(f => f.startsWith("source."));
      if (files.length === 0) {
        return reject(new Error("yt-dlp produced no output file"));
      }
      resolve(path.join(dir, files[0]));
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start yt-dlp: ${err.message}. Make sure yt-dlp is installed.`));
    });
  });
}
