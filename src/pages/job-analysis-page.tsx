import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, Play, Scissors } from "lucide-react";
import { attachJobEventHandlers, createJobEventSource, generateClips, getJob } from "@/lib/jobs-api";
import { formatTime } from "@/lib/format";
import { TimelinePreview } from "@/components/workflow/timeline-preview";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type {
  CaptionPreset,
  CenterBias,
  Highlight,
  RenderEngine,
  ZoomStrength,
} from "@/types/jobs";

export function JobAnalysisPage() {
  const { jobId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localPreviewUrl] = useState<string | null>(
    location.state?.localPreviewUrl ?? null,
  );
  const [captionPreset, setCaptionPreset] = useState<CaptionPreset>("bold");
  const [ctaText, setCtaText] = useState("Follow for more");
  const [renderEngine, setRenderEngine] = useState<RenderEngine>("remotion");
  const [centerBias, setCenterBias] = useState<CenterBias>("center");
  const [zoomStrength, setZoomStrength] = useState<ZoomStrength>("medium");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!jobId) return;

    let mounted = true;
    const poll = async () => {
      try {
        const job = await getJob(jobId);
        if (!mounted) return;
        setProgress(job.progress || 0);
        setProgressMessage(job.progressMessage || "");
        if (job.highlights?.length > 0) {
          const selectedIds = new Set(
            [...job.highlights].sort((a, b) => b.score - a.score).slice(0, 5).map((h) => h.id),
          );
          const decorated = job.highlights.map((h) => ({
            ...h,
            selected: selectedIds.has(h.id),
          }));
          setHighlights((prev) => (prev.length > 0 ? prev : decorated));
          setActiveId((prev) => prev || decorated[0]?.id || null);
        }
      } catch (err: any) {
        setError(err.message || "Failed to fetch job.");
      } finally {
        setLoading(false);
      }
    };

    poll();

    const es = createJobEventSource(jobId);
    attachJobEventHandlers(es, {
      onStatus: (payload) => {
        setProgress(payload.progress || 0);
        setProgressMessage(payload.message || "");
        if (payload.status === "error") {
          setError(payload.error || payload.message || "Processing failed.");
        }
      },
      onHighlightsReady: (payload) => {
        const selectedIds = new Set(
          [...payload.highlights]
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, 5)
            .map((h) => h.id),
        );
        const decorated = payload.highlights.map((h) => ({
          ...h,
          selected: selectedIds.has(h.id),
        }));
        setHighlights(decorated);
        setActiveId(decorated[0]?.id || null);
      },
      onError: (message) => {
        setError(message);
      },
    });

    const pollId = window.setInterval(poll, 7000);
    return () => {
      mounted = false;
      window.clearInterval(pollId);
      es.close();
    };
  }, [jobId]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  const activeHighlight = useMemo(
    () => highlights.find((h) => h.id === activeId) || null,
    [activeId, highlights],
  );
  const selected = useMemo(() => highlights.filter((h) => h.selected), [highlights]);

  const updateHighlight = (id: string, patch: Partial<Highlight>) => {
    setHighlights((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  };

  const adjustHighlight = (id: string, field: "startTime" | "endTime", delta: number) => {
    setHighlights((prev) =>
      prev.map((h) => {
        if (h.id !== id) return h;
        const value = h[field] + delta;
        if (field === "startTime") {
          return { ...h, startTime: Math.max(0, Math.min(value, h.endTime - 5)) };
        }
        return { ...h, endTime: Math.max(h.startTime + 5, value) };
      }),
    );
  };

  const handleGenerate = async () => {
    if (!jobId || selected.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await generateClips(jobId, selected, {
        captionPreset,
        ctaText,
        renderEngine,
        centerBias,
        zoomStrength,
      });
      navigate(`/jobs/${jobId}/queue`, {
        state: {
          captionPreset,
          renderEngine,
          centerBias,
          zoomStrength,
        },
      });
    } catch (err: any) {
      setError(err.message || "Failed to start generation.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Analysis Progress</CardTitle>
          <CardDescription>{progressMessage || "Analyzing video..."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={progress} className="h-3" />
          <p className="text-right text-xs text-muted-foreground">{Math.round(progress)}%</p>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading job state...</span>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>Highlights</CardTitle>
              <CardDescription>Select, tune and preview before render.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[560px] pr-3">
                <div className="space-y-3">
                  {highlights.map((h) => (
                    <div
                      key={h.id}
                      className={`rounded-md border p-3 ${h.selected ? "border-primary bg-primary/5" : ""}`}
                    >
                      <div className="mb-2 flex items-start gap-3">
                        <Switch
                          checked={Boolean(h.selected)}
                          onCheckedChange={() => updateHighlight(h.id, { selected: !h.selected })}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <button
                              className="truncate text-left text-sm font-semibold hover:underline"
                              onClick={() => setActiveId(h.id)}
                            >
                              {h.title}
                            </button>
                            <Badge variant="secondary">{h.score}/10</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{h.reason}</p>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => adjustHighlight(h.id, "startTime", -1)}>
                          <ChevronLeft className="h-3 w-3" />
                        </Button>
                        <span>{formatTime(h.startTime)}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => adjustHighlight(h.id, "startTime", 1)}>
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                        <span>-</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => adjustHighlight(h.id, "endTime", -1)}>
                          <ChevronLeft className="h-3 w-3" />
                        </Button>
                        <span>{formatTime(h.endTime)}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => adjustHighlight(h.id, "endTime", 1)}>
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                        <Button variant="outline" size="sm" className="ml-auto h-6" onClick={() => setActiveId(h.id)}>
                          <Play className="mr-1 h-3 w-3" />
                          Preview
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Timeline Preview</CardTitle>
                <CardDescription>Edit in/out timing before generating.</CardDescription>
              </CardHeader>
              <CardContent>
                {activeHighlight ? (
                  <TimelinePreview
                    videoUrl={localPreviewUrl}
                    startTime={activeHighlight.startTime}
                    endTime={activeHighlight.endTime}
                    min={0}
                    max={Math.max(activeHighlight.endTime + 20, activeHighlight.startTime + 30)}
                    onChange={(next) => updateHighlight(activeHighlight.id, next)}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Select a highlight to start editing.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Render Options</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Field label="Caption Style">
                  <select
                    value={captionPreset}
                    onChange={(e) => setCaptionPreset(e.target.value as CaptionPreset)}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="clean">Clean</option>
                    <option value="bold">Bold</option>
                    <option value="neon">Neon</option>
                  </select>
                </Field>
                <Field label="End Card CTA">
                  <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} maxLength={42} />
                </Field>
                <Field label="Render Engine">
                  <select
                    value={renderEngine}
                    onChange={(e) => setRenderEngine(e.target.value as RenderEngine)}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="remotion">Remotion</option>
                    <option value="ffmpeg">FFmpeg</option>
                  </select>
                </Field>
                <Separator />
                <Field label="Center Bias">
                  <select
                    value={centerBias}
                    onChange={(e) => setCenterBias(e.target.value as CenterBias)}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </Field>
                <Field label="Zoom Strength">
                  <select
                    value={zoomStrength}
                    onChange={(e) => setZoomStrength(e.target.value as ZoomStrength)}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </Field>
                <Button disabled={selected.length === 0 || submitting} onClick={handleGenerate}>
                  <Scissors className="mr-2 h-4 w-4" />
                  {submitting ? "Starting..." : `Generate ${selected.length} Clip${selected.length === 1 ? "" : "s"}`}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

