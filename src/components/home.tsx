import React, { useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Upload, Link, Play, FileVideo } from "lucide-react";
import VideoProcessor from "./VideoProcessor";
import TranscriptionService from "./TranscriptionService";

const Home = () => {
  const [activeTab, setActiveTab] = useState("file");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoSource, setVideoSource] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setVideoFile(e.target.files[0]);
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setYoutubeUrl(e.target.value);
  };

  const handleProcessVideo = () => {
    if (
      (activeTab === "file" && videoFile) ||
      (activeTab === "url" && youtubeUrl)
    ) {
      setIsProcessing(true);
      // In a real implementation, this would process the video
      // For now, we'll simulate processing by setting a timeout
      setTimeout(() => {
        setIsProcessing(false);
        // Set a mock video source for demonstration
        setVideoSource(
          activeTab === "file"
            ? URL.createObjectURL(videoFile as File)
            : "https://example.com/video.mp4",
        );
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Video Highlight Generator
          </h1>
          <p className="text-muted-foreground mt-2">
            Transform long-form videos into shareable short-form clips with
            AI-powered highlights and captions.
          </p>
        </header>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Upload Video</CardTitle>
            <CardDescription>
              Choose a video file from your device or enter a YouTube URL to get
              started.
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
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="video-file">Select Video File</Label>
                    <div className="flex items-center gap-4">
                      <Input
                        id="video-file"
                        type="file"
                        accept="video/*"
                        onChange={handleFileChange}
                      />
                      {videoFile && (
                        <span className="text-sm text-muted-foreground">
                          {videoFile.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="url" className="mt-4">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="youtube-url">YouTube URL</Label>
                    <Input
                      id="youtube-url"
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={youtubeUrl}
                      onChange={handleUrlChange}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="transcribe" className="mt-4">
                <TranscriptionService />
              </TabsContent>

              <div className="mt-6">
                <Button
                  onClick={handleProcessVideo}
                  disabled={
                    isProcessing ||
                    (activeTab === "file" && !videoFile) ||
                    (activeTab === "url" && !youtubeUrl)
                  }
                  className="flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Processing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Process Video
                    </>
                  )}
                </Button>
              </div>
            </Tabs>
          </CardContent>
        </Card>

        {videoSource && (
          <div className="mt-8">
            <Separator className="my-8" />
            <VideoProcessor videoSource={videoSource} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
