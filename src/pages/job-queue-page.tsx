import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { attachJobEventHandlers, clipSrtUrl, clipVideoUrl, createJobEventSource, getJob } from "@/lib/jobs-api";
import { upsertLibraryEntries } from "@/lib/library-store";
import { formatTime } from "@/lib/format";
import { ProgressQueue } from "@/components/workflow/progress-queue";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ClipResult } from "@/types/jobs";

export function JobQueuePage() {
  const { jobId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const runOptions = {
    captionPreset: location.state?.captionPreset || "bold",
    renderEngine: location.state?.renderEngine || "remotion",
  };

  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("Generating clips...");
  const [status, setStatus] = useState("generating_clips");
  const [clips, setClips] = useState<ClipResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let mounted = true;
    const poll = async () => {
      try {
        const job = await getJob(jobId);
        if (!mounted) return;
        setProgress(job.progress || 0);
        setMessage(job.progressMessage || "");
        setStatus(job.status);
        setClips(job.clips || []);
      } catch (err: any) {
        setError(err.message || "Failed to fetch queue state.");
      }
    };

    poll();
    const es = createJobEventSource(jobId);
    attachJobEventHandlers(es, {
      onStatus: (payload) => {
        setProgress(payload.progress || 0);
        setMessage(payload.message || "");
        if (payload.status) setStatus(payload.status);
      },
      onClipReady: (payload) => {
        setClips((prev) => {
          const idx = prev.findIndex((c) => c.id === payload.clip.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = payload.clip;
            return next;
          }
          return [...prev, payload.clip];
        });
      },
      onComplete: (payload) => {
        setStatus("complete");
        setProgress(100);
        const done = (payload.clips || []).filter((c) => c.status === "done");
        if (done.length > 0) {
          upsertLibraryEntries(
            done.map((clip) => ({
              ...clip,
              jobId,
              createdAt: Date.now(),
              captionPreset: runOptions.captionPreset,
              renderEngine: runOptions.renderEngine,
            })),
          );
        }
      },
      onError: (msg) => setError(msg),
    });

    const timer = window.setInterval(poll, 7000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      es.close();
    };
  }, [jobId, runOptions.captionPreset, runOptions.renderEngine]);

  const doneCount = useMemo(
    () => clips.filter((clip) => clip.status === "done").length,
    [clips],
  );

  return (
    <div className="grid gap-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Render Progress</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={progress} className="h-3" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{Math.round(progress)}%</span>
            <Badge variant={status === "complete" ? "default" : "secondary"}>
              {status}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <ProgressQueue clips={clips} />

      {status === "complete" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Generation complete
            </CardTitle>
            <CardDescription>{doneCount} clip(s) ready</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {clips
              .filter((clip) => clip.status === "done")
              .map((clip) => (
                <div key={clip.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{clip.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <a href={clipSrtUrl(jobId, clip.id)} download={`${clip.title}.srt`}>
                      SRT
                    </a>
                  </Button>
                  <Button asChild size="sm">
                    <a href={clipVideoUrl(jobId, clip.id)} download={`${clip.title}.mp4`}>
                      Video
                    </a>
                  </Button>
                </div>
              ))}
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/library">Open Library</Link>
              </Button>
              <Button onClick={() => navigate("/new")}>New Job</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Rendering in progress...
        </div>
      )}
    </div>
  );
}

