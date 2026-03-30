import { spawn } from "child_process";
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
    const enableEjsRuntime = process.env.YTDLP_ENABLE_EJS === "1";
    const jsRuntime = process.env.YTDLP_JS_RUNTIME ?? "node";
    const cookiesBrowser = process.env.YTDLP_COOKIES_BROWSER;

    const baseArgs = [
      // Prefer higher quality to reduce vertical upscale artifacts.
      "-f",
      "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
      // Prefer H.264 where possible for compatibility.
      "-S",
      "res:1080,fps,codec:h264",
      "--js-runtimes", jsRuntime,
      "-N", "4",
      "--merge-output-format", "mp4",
      "-o", outputTemplate,
      "--no-playlist",
      "--newline",
      "--no-warnings",
      url,
    ];

    if (enableEjsRuntime) {
      baseArgs.splice(8, 0, "--remote-components", "ejs:github");
    }

    const argsWithCookies = cookiesBrowser
      ? [...baseArgs.slice(0, -1), "--cookies-from-browser", cookiesBrowser, url]
      : [...baseArgs];
    const argsWithoutCookies = [...baseArgs];

    let lastPct = 0;
    let settled = false;

    const finishResolve = (filePath: string) => {
      if (settled) return;
      settled = true;
      resolve(filePath);
    };

    const finishReject = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    // Allow overrides for different install layouts.
    const ytDlpCmd = process.env.YTDLP_CMD ?? "yt-dlp";
    const pythonFallbackCmd = process.env.YTDLP_PYTHON_CMD ?? "py";
    let triedPythonModule = false;
    let triedNoCookies = false;
    let runCounter = 0;
    let activeRunId = 0;

    const runYtDlp = (
      command: string,
      commandPrefixArgs: string[] = [],
      ytArgs: string[] = argsWithCookies,
    ) => {
      const runId = ++runCounter;
      activeRunId = runId;

      let stderrBuffer = "";
      const proc = spawn(command, [...commandPrefixArgs, ...ytArgs]);

      proc.stdout.on("data", (data: Buffer) => {
        if (activeRunId !== runId) return;
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
        if (activeRunId !== runId) return;
        const text = data.toString();
        console.error("[yt-dlp]", text);

        stderrBuffer += text;
        // Keep only the tail; stderr can be large during real downloads.
        if (stderrBuffer.length > 20000) {
          stderrBuffer = stderrBuffer.slice(-20000);
        }

        // yt-dlp can fail in some Windows environments when attempting to read/decrypt
        // the browser cookies database via DPAPI (common when the credential store
        // isn't accessible). If this happens, retry without browser cookies.
        const dpapiDetected =
          /decrypt with DPAPI/i.test(stderrBuffer) ||
          /Failed to decrypt with DPAPI/i.test(stderrBuffer) ||
          /DPAPI/i.test(stderrBuffer);

        if (dpapiDetected) {
          if (!triedNoCookies && ytArgs.includes("--cookies-from-browser")) {
            triedNoCookies = true;
            console.error(
              "[yt-dlp] DPAPI cookie decryption failed; retrying without --cookies-from-browser",
            );
            runYtDlp(command, commandPrefixArgs, argsWithoutCookies);
          }
        }
      });

      proc.on("close", (code) => {
        if (activeRunId !== runId) return;
        if (settled) return;
        if (code !== 0) {
          // If we already retried via python because the CLI wasn't on PATH,
          // ignore the failing close from the initial attempt.
          if (command === ytDlpCmd && triedPythonModule) return;
          return finishReject(new Error(`yt-dlp exited with code ${code}`));
        }
        const files = fs.readdirSync(dir).filter((f) => f.startsWith("source."));
        if (files.length === 0) {
          return finishReject(new Error("yt-dlp produced no output file"));
        }
        finishResolve(path.join(dir, files[0]));
      });

      proc.on("error", (err: any) => {
        if (settled) return;
        const code = err?.code;

        // If the CLI isn't on PATH, try running via Python module once.
        // This avoids needing to manually add `yt-dlp.exe` to PATH.
        if (code === "ENOENT" && command === ytDlpCmd && !triedPythonModule) {
          triedPythonModule = true;
          runYtDlp(pythonFallbackCmd, ["-m", "yt_dlp"], ytArgs);
          return;
        }

        finishReject(
          new Error(
            `Failed to start yt-dlp using "${command}": ${
              err?.message ?? String(err)
            }. Make sure yt-dlp is installed.`,
          ),
        );
      });

      return proc;
    };

    runYtDlp(ytDlpCmd);
  });
}
