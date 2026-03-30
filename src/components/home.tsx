import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Play,
  FileVideo,
  Link,
  Loader2,
  Sparkles,
  Download,
  Check,
  Clock,
  Scissors,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface Highlight {
  id: string;
  title: string;
  reason: string;
  startTime: number;
  endTime: number;
  score: number;
  transcript: string;
  selected: boolean;
}

interface ClipResult {
  id: string;
  highlightId: string;
  title: string;
  startTime: number;
  endTime: number;
  status: string;
}

type Step = "upload" | "processing" | "highlights" | "generating" | "results";

const API_BASE = "/api";

const Home = () => {
  const [step, setStep] = useState<Step>("upload");
  const [activeTab, setActiveTab] = useState("file");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [clips, setClips] = useState<ClipResult[]>([]);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const connectSSE = useCallback((id: string) => {
    cleanup();
    const es = new EventSource(`${API_BASE}/jobs/${id}/events`);
    eventSourceRef.current = es;

    es.addEventListener("status", (e) => {
      const data = JSON.parse(e.data);
      setProgress(data.progress || 0);
      setProgressMessage(data.message || "");
      if (data.status === "error") {
        setError(data.error || data.message || "Something went wrong during processing.");
        setStep("upload");
        es.close();
      }
    });

    es.addEventListener("error", (e: any) => {
      try {
        const data = JSON.parse(e.data);
        setError(data.error || "Processing failed.");
      } catch {
        setError("Processing failed.");
      }
      setStep("upload");
      es.close();
    });

    es.addEventListener("highlights_ready", (e) => {
      const data = JSON.parse(e.data);
      const incoming: Highlight[] = data.highlights.map((h: any) => ({
        ...h,
        selected: false,
      }));
      // Always preselect at least 5 clips for the user.
      const sorted = [...incoming].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      const toSelect = Math.min(5, sorted.length);
      const selectedIds = new Set(sorted.slice(0, toSelect).map((h) => h.id));
      const hl = incoming.map((h) => ({ ...h, selected: selectedIds.has(h.id) }));
      setHighlights(hl);
      setStep("highlights");
    });

    es.addEventListener("clip_ready", (e) => {
      const data = JSON.parse(e.data);
      setClips((prev) => {
        const existing = prev.find((c) => c.id === data.clip.id);
        if (existing) {
          return prev.map((c) => (c.id === data.clip.id ? data.clip : c));
        }
        return [...prev, data.clip];
      });
    });

    es.addEventListener("complete", () => {
      setStep("results");
      setProgress(100);
      setProgressMessage("All clips generated!");
      es.close();
    });

    es.onerror = () => {
      console.error("SSE connection error");
    };
  }, [cleanup]);

  const handleProcessVideo = async () => {
    setError(null);
    setStep("processing");
    setProgress(5);
    setProgressMessage("Uploading video...");

    try {
      let response: Response;

      if (activeTab === "file" && videoFile) {
        const formData = new FormData();
        formData.append("video", videoFile);
        response = await fetch(`${API_BASE}/jobs`, {
          method: "POST",
          body: formData,
        });
        setVideoPreviewUrl(URL.createObjectURL(videoFile));
      } else if (activeTab === "url" && youtubeUrl) {
        response = await fetch(`${API_BASE}/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ youtubeUrl }),
        });
      } else {
        throw new Error("No video selected");
      }

      if (!response!.ok) {
        let errMsg = `Server error (${response!.status})`;
        try {
          const err = await response!.json();
          errMsg = err.error || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      const data = await response!.json();
      setJobId(data.jobId);
      connectSSE(data.jobId);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setStep("upload");
    }
  };

  const handleGenerateClips = async () => {
    if (!jobId) return;

    const selected = highlights.filter((h) => h.selected);
    if (selected.length === 0) {
      setError("Select at least one highlight to generate clips.");
      return;
    }

    setError(null);
    setStep("generating");
    setProgress(85);
    setProgressMessage(`Generating ${selected.length} clip(s)...`);
    setClips([]);

    try {
      const response = await fetch(`${API_BASE}/jobs/${jobId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clips: selected.map((h) => ({
            highlightId: h.id,
            title: h.title,
            startTime: h.startTime,
            endTime: h.endTime,
          })),
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to start clip generation");
      }
    } catch (err: any) {
      setError(err.message || "Clip generation failed");
      setStep("highlights");
    }
  };

  const toggleHighlight = (id: string) => {
    setHighlights((prev) =>
      prev.map((h) => (h.id === id ? { ...h, selected: !h.selected } : h)),
    );
  };

  const adjustHighlight = (
    id: string,
    field: "startTime" | "endTime",
    delta: number,
  ) => {
    setHighlights((prev) =>
      prev.map((h) => {
        if (h.id !== id) return h;
        const newVal = h[field] + delta;
        if (field === "startTime") {
          return { ...h, startTime: Math.max(0, Math.min(newVal, h.endTime - 5)) };
        }
        return { ...h, endTime: Math.max(h.startTime + 5, newVal) };
      }),
    );
  };

  const previewHighlight = (h: Highlight) => {
    if (videoRef.current) {
      videoRef.current.currentTime = h.startTime;
      videoRef.current.play();
    }
  };

  const handleReset = () => {
    cleanup();
    setStep("upload");
    setJobId(null);
    setProgress(0);
    setProgressMessage("");
    setError(null);
    setHighlights([]);
    setClips([]);
    setVideoFile(null);
    setYoutubeUrl("");
    setVideoPreviewUrl(null);
  };

  const selectedCount = highlights.filter((h) => h.selected).length;

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Video Highlight Generator
          </h1>
          <p className="text-muted-foreground mt-2">
            Transform long-form videos into shareable short-form clips with
            AI-powered highlights and captions.
          </p>
        </header>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* STEP 1: Upload */}
        {step === "upload" && (
          <Card>
            <CardHeader>
              <CardTitle>Upload Video</CardTitle>
              <CardDescription>
                Choose a video file or enter a YouTube URL to get started.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs
                defaultValue="file"
                value={activeTab}
                onValueChange={setActiveTab}
              >
                <TabsList className="grid w-full max-w-md grid-cols-2">
                  <TabsTrigger value="file" className="flex items-center gap-2">
                    <FileVideo className="h-4 w-4" />
                    Video File
                  </TabsTrigger>
                  <TabsTrigger value="url" className="flex items-center gap-2">
                    <Link className="h-4 w-4" />
                    YouTube URL
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="file" className="mt-4">
                  <div className="grid gap-2">
                    <Label htmlFor="video-file">Select Video File</Label>
                    <Input
                      id="video-file"
                      type="file"
                      accept="video/*"
                      onChange={(e) => {
                        if (e.target.files?.[0]) setVideoFile(e.target.files[0]);
                      }}
                    />
                    {videoFile && (
                      <p className="text-sm text-muted-foreground">
                        {videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(1)} MB)
                      </p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="url" className="mt-4">
                  <div className="grid gap-2">
                    <Label htmlFor="youtube-url">YouTube URL</Label>
                    <Input
                      id="youtube-url"
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                    />
                  </div>
                </TabsContent>
              </Tabs>

              <div className="mt-6">
                <Button
                  onClick={handleProcessVideo}
                  disabled={
                    (activeTab === "file" && !videoFile) ||
                    (activeTab === "url" && !youtubeUrl)
                  }
                  className="flex items-center gap-2"
                  size="lg"
                >
                  <Sparkles className="h-4 w-4" />
                  Analyze Video
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 2: Processing */}
        {step === "processing" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Processing Video
              </CardTitle>
              <CardDescription>{progressMessage}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progress} className="h-3" />
              <p className="text-sm text-muted-foreground text-right">
                {Math.round(progress)}%
              </p>
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="text-sm font-medium mb-2">What's happening:</h4>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li className={progress >= 5 ? "text-foreground" : ""}>
                    {activeTab === "url" ? "Downloading video from YouTube" : "Uploading video"}
                  </li>
                  <li className={progress >= 25 ? "text-foreground" : ""}>
                    Extracting audio track
                  </li>
                  <li className={progress >= 35 ? "text-foreground" : ""}>
                    Transcribing speech with AI
                  </li>
                  <li className={progress >= 60 ? "text-foreground" : ""}>
                    Analyzing for engaging moments
                  </li>
                </ol>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 3: Highlight Selection */}
        {step === "highlights" && (
          <>
            {videoPreviewUrl && (
              <Card className="mb-6">
                <CardContent className="p-4">
                  <div className="aspect-video bg-black rounded-lg overflow-hidden">
                    <video
                      ref={videoRef}
                      src={videoPreviewUrl}
                      controls
                      className="w-full h-full"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      AI-Suggested Highlights
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {highlights.length} highlights found. Select the ones you want
                      to generate as clips. You can adjust the timing boundaries.
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="text-sm">
                    {selectedCount} selected
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[600px]">
                  <div className="space-y-3">
                    {highlights.map((h) => (
                      <div
                        key={h.id}
                        className={`border rounded-lg p-4 transition-colors ${h.selected ? "border-primary bg-primary/5" : "border-border"}`}
                      >
                        <div className="flex items-start gap-3">
                          <Switch
                            checked={h.selected}
                            onCheckedChange={() => toggleHighlight(h.id)}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-sm truncate">
                                {h.title}
                              </h4>
                              <Badge
                                variant={h.score >= 8 ? "default" : "secondary"}
                                className="shrink-0"
                              >
                                {h.score}/10
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              {h.reason}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={() => adjustHighlight(h.id, "startTime", -5)}
                                >
                                  <ChevronLeft className="h-3 w-3" />
                                </Button>
                                <span className="font-mono">
                                  {formatTime(h.startTime)}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={() => adjustHighlight(h.id, "startTime", 5)}
                                >
                                  <ChevronRight className="h-3 w-3" />
                                </Button>
                              </div>
                              <span>-</span>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={() => adjustHighlight(h.id, "endTime", -5)}
                                >
                                  <ChevronLeft className="h-3 w-3" />
                                </Button>
                                <span className="font-mono">
                                  {formatTime(h.endTime)}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={() => adjustHighlight(h.id, "endTime", 5)}
                                >
                                  <ChevronRight className="h-3 w-3" />
                                </Button>
                              </div>
                              <span className="ml-1">
                                ({Math.round(h.endTime - h.startTime)}s)
                              </span>
                              {videoPreviewUrl && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 ml-2"
                                  onClick={() => previewHighlight(h)}
                                >
                                  <Play className="h-3 w-3 mr-1" />
                                  Preview
                                </Button>
                              )}
                            </div>
                            {h.transcript && (
                              <p className="text-xs text-muted-foreground mt-2 italic line-clamp-2">
                                "{h.transcript}"
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <Separator className="my-4" />

                <div className="flex items-center justify-between">
                  <Button variant="outline" onClick={handleReset}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Start Over
                  </Button>
                  <Button
                    onClick={handleGenerateClips}
                    disabled={selectedCount === 0}
                    size="lg"
                  >
                    <Scissors className="h-4 w-4 mr-2" />
                    Generate {selectedCount} Clip{selectedCount !== 1 ? "s" : ""}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* STEP 4: Generating */}
        {step === "generating" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Generating Clips
              </CardTitle>
              <CardDescription>{progressMessage}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progress} className="h-3" />
              <p className="text-sm text-muted-foreground text-right">
                {Math.round(progress)}%
              </p>
              {clips.length > 0 && (
                <div className="space-y-2">
                  {clips.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 text-sm p-2 rounded bg-muted/50"
                    >
                      <Check className="h-4 w-4 text-green-500" />
                      <span>{c.title}</span>
                      <Badge variant="secondary" className="ml-auto">
                        {c.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* STEP 5: Results */}
        {step === "results" && jobId && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-green-500" />
                    Clips Ready
                  </CardTitle>
                  <CardDescription>
                    {clips.length} clip{clips.length !== 1 ? "s" : ""} generated
                    with subtitles burned in.
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={handleReset}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  New Video
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {clips.map((clip) => (
                  <div key={clip.id} className="border rounded-lg overflow-hidden">
                    <div className="bg-black p-4">
                      <div className="aspect-[9/16] max-w-[360px] mx-auto rounded-md overflow-hidden">
                        <video
                          src={`${API_BASE}/jobs/${jobId}/clips/${clip.id}`}
                          controls
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold">{clip.title}</h4>
                        <p className="text-sm text-muted-foreground">
                          {formatTime(clip.startTime)} - {formatTime(clip.endTime)} (
                          {Math.round(clip.endTime - clip.startTime)}s)
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <a
                            href={`${API_BASE}/jobs/${jobId}/clips/${clip.id}/srt`}
                            download={`${clip.title}.srt`}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            SRT
                          </a>
                        </Button>
                        <Button size="sm" asChild>
                          <a
                            href={`${API_BASE}/jobs/${jobId}/clips/${clip.id}`}
                            download={`${clip.title}.mp4`}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Video
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Home;
