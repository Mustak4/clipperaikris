import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Upload,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Youtube,
  FileVideo,
  Clock,
  Scissors,
} from "lucide-react";
import ClipEditor from "./ClipEditor";
import CaptionCustomizer from "./CaptionCustomizer";

interface VideoProcessorProps {
  onProcessComplete?: (videoData: any) => void;
}

const VideoProcessor = ({
  onProcessComplete = () => {},
}: VideoProcessorProps) => {
  const [activeTab, setActiveTab] = useState("upload");
  const [videoSource, setVideoSource] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStep, setProcessingStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<
    Array<{ start: number; end: number; text: string }>
  >([]);
  const [suggestedHighlights, setSuggestedHighlights] = useState<
    Array<{ start: number; end: number; title: string }>
  >([]);
  const [selectedClip, setSelectedClip] = useState<{
    start: number;
    end: number;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mock data for demonstration
  const mockTranscript = [
    {
      start: 0,
      end: 5,
      text: "Welcome to this fascinating discussion about AI technology.",
    },
    {
      start: 5,
      end: 10,
      text: "Today we're going to explore how machine learning is transforming industries.",
    },
    {
      start: 10,
      end: 15,
      text: "One of the key breakthroughs has been in natural language processing.",
    },
    // More transcript entries would go here
  ];

  const mockHighlights = [
    { start: 5, end: 15, title: "Introduction to Machine Learning Impact" },
    { start: 45, end: 60, title: "Key Breakthrough in NLP" },
    { start: 120, end: 135, title: "Future Applications of AI" },
  ];

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSource(url);
      simulateProcessing();
    }
  };

  const handleYoutubeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (youtubeUrl) {
      // In a real implementation, this would extract the video from the YouTube URL
      setVideoSource(
        "https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=800&q=80",
      );
      simulateProcessing();
    }
  };

  const simulateProcessing = () => {
    setIsProcessing(true);
    setProcessingStep("Transcribing video...");

    // Simulate the processing steps with timeouts
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      setProcessingProgress(progress);

      if (progress === 30) {
        setProcessingStep("Analyzing content for key moments...");
      } else if (progress === 60) {
        setProcessingStep("Generating highlight suggestions...");
      } else if (progress >= 100) {
        clearInterval(interval);
        setIsProcessing(false);
        setTranscript(mockTranscript);
        setSuggestedHighlights(mockHighlights);
        setActiveTab("edit");
      }
    }, 300);
  };

  const handleClipSelect = (start: number, end: number) => {
    setSelectedClip({ start, end });
    if (videoRef.current) {
      videoRef.current.currentTime = start;
    }
  };

  const handleClipSave = (clipData: any) => {
    // In a real implementation, this would save the clip data and move to caption customization
    setActiveTab("caption");
  };

  const handleFinalizeClip = (captionData: any) => {
    // In a real implementation, this would generate the final clip with captions
    onProcessComplete({ clip: selectedClip, captions: captionData });
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4 bg-background">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="upload" disabled={isProcessing}>
            Upload
          </TabsTrigger>
          <TabsTrigger value="edit" disabled={!videoSource || isProcessing}>
            Edit
          </TabsTrigger>
          <TabsTrigger value="caption" disabled={!selectedClip}>
            Customize
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload Video</CardTitle>
              <CardDescription>
                Upload a video file or enter a YouTube URL to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div
                    className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-12 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={triggerFileInput}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <FileVideo className="h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-sm text-gray-500">
                      Click to upload video file
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      MP4, MOV, or WebM
                    </p>
                  </div>
                  <Button
                    onClick={triggerFileInput}
                    className="w-full"
                    variant="outline"
                  >
                    <Upload className="mr-2 h-4 w-4" /> Select Video File
                  </Button>
                </div>

                <div className="space-y-4">
                  <form onSubmit={handleYoutubeSubmit} className="space-y-4">
                    <div className="flex flex-col space-y-2">
                      <label
                        htmlFor="youtube-url"
                        className="text-sm font-medium"
                      >
                        YouTube URL
                      </label>
                      <div className="flex space-x-2">
                        <Input
                          id="youtube-url"
                          type="text"
                          placeholder="https://www.youtube.com/watch?v=..."
                          value={youtubeUrl}
                          onChange={(e) => setYoutubeUrl(e.target.value)}
                        />
                        <Button type="submit" disabled={!youtubeUrl}>
                          <Youtube className="mr-2 h-4 w-4" /> Import
                        </Button>
                      </div>
                    </div>
                  </form>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-sm font-medium mb-2">How it works</h4>
                    <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                      <li>Upload your video or paste a YouTube URL</li>
                      <li>Our AI will transcribe and analyze the content</li>
                      <li>Select and edit suggested highlights</li>
                      <li>Customize captions for your clip</li>
                      <li>Download your ready-to-share highlight</li>
                    </ol>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {isProcessing && (
            <Card>
              <CardHeader>
                <CardTitle>Processing Video</CardTitle>
                <CardDescription>{processingStep}</CardDescription>
              </CardHeader>
              <CardContent>
                <Progress value={processingProgress} className="h-2" />
                <p className="text-xs text-gray-500 mt-2 text-right">
                  {processingProgress}%
                </p>
              </CardContent>
            </Card>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="edit">
          <Card>
            <CardHeader>
              <CardTitle>Edit Highlights</CardTitle>
              <CardDescription>
                Review the transcript and suggested highlights, or create your
                own
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="aspect-video bg-black rounded-lg overflow-hidden">
                  {videoSource && (
                    <video
                      ref={videoRef}
                      src={videoSource}
                      controls
                      className="w-full h-full"
                    />
                  )}
                </div>

                <ClipEditor
                  transcript={transcript}
                  suggestedHighlights={suggestedHighlights}
                  onClipSelect={handleClipSelect}
                  videoRef={videoRef}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setActiveTab("upload")}>
                Back to Upload
              </Button>
              <Button
                onClick={() => handleClipSave(selectedClip)}
                disabled={!selectedClip}
              >
                <Scissors className="mr-2 h-4 w-4" /> Save Clip & Continue
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="caption">
          <Card>
            <CardHeader>
              <CardTitle>Customize Captions</CardTitle>
              <CardDescription>
                Style and position captions for your highlight clip
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="aspect-video bg-black rounded-lg overflow-hidden">
                  {videoSource && (
                    <video
                      src={videoSource}
                      controls
                      className="w-full h-full"
                    />
                  )}
                </div>

                <CaptionCustomizer
                  transcript={transcript.filter(
                    (item) =>
                      selectedClip &&
                      item.start >= selectedClip.start &&
                      item.end <= selectedClip.end,
                  )}
                  onCaptionChange={(captionData) => console.log(captionData)}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setActiveTab("edit")}>
                Back to Edit
              </Button>
              <Button onClick={() => handleFinalizeClip({ style: "default" })}>
                Generate Final Clip
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default VideoProcessor;
