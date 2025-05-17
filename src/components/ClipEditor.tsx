import React, { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Scissors,
  Check,
} from "lucide-react";

interface ClipEditorProps {
  videoUrl?: string;
  transcript?: Array<{
    id: string;
    startTime: number;
    endTime: number;
    text: string;
    isHighlight?: boolean;
  }>;
  suggestedHighlights?: Array<{
    id: string;
    startTime: number;
    endTime: number;
    title: string;
  }>;
  onClipSelect?: (startTime: number, endTime: number) => void;
  onClipConfirm?: (startTime: number, endTime: number) => void;
}

const ClipEditor = ({
  videoUrl = "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&q=80",
  transcript = [
    {
      id: "1",
      startTime: 0,
      endTime: 5,
      text: "Welcome to this video about AI and machine learning.",
      isHighlight: true,
    },
    {
      id: "2",
      startTime: 5,
      endTime: 10,
      text: "Today we'll be discussing the latest advancements in the field.",
    },
    {
      id: "3",
      startTime: 10,
      endTime: 15,
      text: "Let's start with neural networks and how they've evolved.",
      isHighlight: true,
    },
    {
      id: "4",
      startTime: 15,
      endTime: 20,
      text: "The applications of these technologies are truly remarkable.",
    },
    {
      id: "5",
      startTime: 20,
      endTime: 25,
      text: "From healthcare to finance, AI is transforming industries.",
      isHighlight: true,
    },
  ],
  suggestedHighlights = [
    { id: "h1", startTime: 0, endTime: 5, title: "Introduction" },
    { id: "h2", startTime: 10, endTime: 15, title: "Neural Networks" },
    { id: "h3", startTime: 20, endTime: 25, title: "Industry Applications" },
  ],
  onClipSelect = () => {},
  onClipConfirm = () => {},
}: ClipEditorProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(30); // Default 30 seconds
  const videoDuration = 120; // Mock video duration in seconds

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleTimeChange = (value: number[]) => {
    setCurrentTime(value[0]);
  };

  const handleClipRangeChange = (value: number[]) => {
    setClipStart(value[0]);
    setClipEnd(value[1]);
    onClipSelect(value[0], value[1]);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const jumpToTranscriptPoint = (startTime: number) => {
    setCurrentTime(startTime);
  };

  const selectHighlight = (startTime: number, endTime: number) => {
    setClipStart(startTime);
    setClipEnd(endTime);
    onClipSelect(startTime, endTime);
  };

  const confirmClip = () => {
    onClipConfirm(clipStart, clipEnd);
  };

  return (
    <div className="w-full bg-background rounded-lg p-4 space-y-4">
      {/* Video Preview */}
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        {videoUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src={videoUrl}
              alt="Video preview"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Button
                variant="outline"
                size="icon"
                className="rounded-full bg-white/20 hover:bg-white/30"
                onClick={handlePlayPause}
              >
                {isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6" />
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Current clip selection indicator */}
        <div className="absolute bottom-4 left-4 right-4 bg-black/70 text-white px-3 py-1 rounded-md text-sm">
          Selected clip: {formatTime(clipStart)} - {formatTime(clipEnd)} (
          {(clipEnd - clipStart).toFixed(1)}s)
        </div>
      </div>

      {/* Timeline Controls */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Current: {formatTime(currentTime)}</span>
              <span>Duration: {formatTime(videoDuration)}</span>
            </div>
            <Slider
              value={[currentTime]}
              min={0}
              max={videoDuration}
              step={0.1}
              onValueChange={handleTimeChange}
              className="cursor-pointer"
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium">Clip Selection</span>
              <span className="text-sm text-muted-foreground">
                {formatTime(clipStart)} - {formatTime(clipEnd)}
              </span>
            </div>
            <Slider
              value={[clipStart, clipEnd]}
              min={0}
              max={videoDuration}
              step={0.1}
              onValueChange={handleClipRangeChange}
              className="cursor-pointer"
            />
            <div className="flex justify-between gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setClipStart(Math.max(0, clipStart - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> -1s
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setClipStart(Math.min(clipEnd - 1, clipStart + 1))
                }
              >
                +1s <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setClipEnd(Math.max(clipStart + 1, clipEnd - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> -1s
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setClipEnd(Math.min(videoDuration, clipEnd + 1))}
              >
                +1s <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transcript and Highlights */}
      <Tabs defaultValue="transcript" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="highlights">Suggested Highlights</TabsTrigger>
        </TabsList>

        <TabsContent value="transcript" className="mt-2">
          <Card>
            <CardContent className="p-4">
              <ScrollArea className="h-64">
                <div className="space-y-2">
                  {transcript.map((item) => (
                    <div
                      key={item.id}
                      className={`p-2 rounded-md cursor-pointer hover:bg-accent ${item.isHighlight ? "border-l-4 border-primary" : ""} ${currentTime >= item.startTime && currentTime < item.endTime ? "bg-accent" : ""}`}
                      onClick={() => jumpToTranscriptPoint(item.startTime)}
                    >
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">
                          {formatTime(item.startTime)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectHighlight(item.startTime, item.endTime);
                          }}
                        >
                          <Scissors className="h-3 w-3 mr-1" /> Clip
                        </Button>
                      </div>
                      <p className="text-sm mt-1">{item.text}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="highlights" className="mt-2">
          <Card>
            <CardContent className="p-4">
              <ScrollArea className="h-64">
                <div className="space-y-2">
                  {suggestedHighlights.map((highlight) => (
                    <div
                      key={highlight.id}
                      className="p-3 border rounded-md hover:bg-accent cursor-pointer"
                      onClick={() =>
                        selectHighlight(highlight.startTime, highlight.endTime)
                      }
                    >
                      <div className="flex justify-between items-center">
                        <h4 className="font-medium">{highlight.title}</h4>
                        <span className="text-sm text-muted-foreground">
                          {formatTime(highlight.startTime)} -{" "}
                          {formatTime(highlight.endTime)}(
                          {(highlight.endTime - highlight.startTime).toFixed(1)}
                          s)
                        </span>
                      </div>
                      <div className="flex justify-end mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectHighlight(
                              highlight.startTime,
                              highlight.endTime,
                            );
                          }}
                        >
                          <Scissors className="h-4 w-4 mr-2" /> Select Clip
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setClipStart(0);
            setClipEnd(30);
          }}
        >
          Reset Selection
        </Button>
        <Button onClick={confirmClip} className="gap-2">
          <Check className="h-4 w-4" /> Confirm Clip
        </Button>
      </div>
    </div>
  );
};

export default ClipEditor;
