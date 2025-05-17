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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Clock, Sparkles, Star, BookMarked } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface Highlight {
  id: string;
  title: string;
  summary: string;
  startTime: number;
  endTime: number;
  transcript: string;
}

interface TranscriptionServiceProps {
  onTranscriptionComplete?: (transcriptionData: any) => void;
}

const TranscriptionService = ({
  onTranscriptionComplete = () => {},
}: TranscriptionServiceProps) => {
  const [videoUrl, setVideoUrl] = useState("");
  const [videoSource, setVideoSource] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [timestampedTranscription, setTimestampedTranscription] =
    useState<Array<{ time: number; text: string; speaker?: string }> | null>(
      null,
    );
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [activeTab, setActiveTab] = useState("transcript");

  const videoRef = useRef<HTMLVideoElement>(null);

  // Mock transcription data for demonstration
  const mockTranscription = `[00:00] Host: Welcome to this fascinating discussion about AI technology. Today we're going to explore how machine learning is transforming industries. One of the key breakthroughs has been in natural language processing.

[00:30] Host: Neural networks have revolutionized how computers understand human language. This has led to remarkable improvements in translation services, chatbots, and voice assistants that we use every day.

[01:00] Dr. Smith: Another exciting area is computer vision. Modern AI systems can now recognize objects, faces, and even emotions with incredible accuracy. This technology is being applied in fields ranging from autonomous vehicles to medical diagnostics.

[01:30] Dr. Smith: Let me share a personal story. Last year, I was working with a hospital that implemented an AI system for detecting early signs of diabetic retinopathy. The system identified a case that human doctors had missed, potentially saving a patient's vision.

[02:15] Host: That's incredible! Could you explain how the system works?

[02:20] Dr. Smith: Of course. The AI analyzes retinal images looking for microaneurysms and hemorrhages that are early indicators of the disease. It compares thousands of images to identify patterns that might be invisible to the human eye.

[03:00] Host: The ethical implications of these technologies cannot be overlooked. As AI becomes more integrated into our daily lives, questions about privacy, bias, and accountability become increasingly important.

[03:30] Dr. Smith: Absolutely. Here's my top advice for organizations implementing AI: First, ensure diverse training data. Second, implement regular bias audits. And third, maintain human oversight for critical decisions.

[04:15] Host: Looking ahead, the future of AI promises even more transformative changes. From personalized medicine to climate modeling, the potential applications seem limitless. However, we must ensure that these technologies are developed responsibly.

[04:45] Dr. Smith: I believe the most exciting frontier is in multimodal AI systems that can understand and process information across different formats - text, images, audio, and more.

[05:15] Host: Thank you for joining this exploration of artificial intelligence and its impact on our world. The conversation around AI will continue to evolve as the technology advances.`;

  // Mock highlights data
  const mockHighlights: Highlight[] = [
    {
      id: "1",
      title: "Computer Vision Breakthrough",
      summary:
        "Dr. Smith explains how AI systems can now recognize objects, faces, and emotions with incredible accuracy.",
      startTime: 60,
      endTime: 90,
      transcript:
        "Another exciting area is computer vision. Modern AI systems can now recognize objects, faces, and even emotions with incredible accuracy. This technology is being applied in fields ranging from autonomous vehicles to medical diagnostics.",
    },
    {
      id: "2",
      title: "AI Saving Patient's Vision",
      summary:
        "A personal anecdote about AI detecting diabetic retinopathy that human doctors missed.",
      startTime: 90,
      endTime: 135,
      transcript:
        "Let me share a personal story. Last year, I was working with a hospital that implemented an AI system for detecting early signs of diabetic retinopathy. The system identified a case that human doctors had missed, potentially saving a patient's vision.",
    },
    {
      id: "3",
      title: "How AI Detects Eye Disease",
      summary:
        "Technical explanation of how AI analyzes retinal images to detect early disease indicators.",
      startTime: 140,
      endTime: 180,
      transcript:
        "The AI analyzes retinal images looking for microaneurysms and hemorrhages that are early indicators of the disease. It compares thousands of images to identify patterns that might be invisible to the human eye.",
    },
    {
      id: "4",
      title: "Top 3 AI Implementation Tips",
      summary:
        "Dr. Smith provides three key pieces of advice for organizations implementing AI systems.",
      startTime: 210,
      endTime: 255,
      transcript:
        "Here's my top advice for organizations implementing AI: First, ensure diverse training data. Second, implement regular bias audits. And third, maintain human oversight for critical decisions.",
    },
    {
      id: "5",
      title: "The Future of Multimodal AI",
      summary:
        "Dr. Smith discusses the exciting frontier of AI systems that can process multiple types of information.",
      startTime: 285,
      endTime: 315,
      transcript:
        "I believe the most exciting frontier is in multimodal AI systems that can understand and process information across different formats - text, images, audio, and more.",
    },
  ];

  const parseTimestampedTranscription = (fullText: string) => {
    // Parse the text with timestamps in the format [mm:ss]
    const segments = fullText.split("\n\n");
    const timestamped: Array<{ time: number; text: string; speaker?: string }> =
      [];

    segments.forEach((segment) => {
      if (segment.trim()) {
        // Extract timestamp and text
        const timeMatch = segment.match(/\[(\d+):(\d+)\]/);
        if (timeMatch) {
          const minutes = parseInt(timeMatch[1]);
          const seconds = parseInt(timeMatch[2]);
          const timeInSeconds = minutes * 60 + seconds;

          // Extract speaker if present
          let text = segment.substring(timeMatch[0].length).trim();
          let speaker;

          const speakerMatch = text.match(/^([^:]+):\s/);
          if (speakerMatch) {
            speaker = speakerMatch[1].trim();
            text = text.substring(speakerMatch[0].length);
          }

          timestamped.push({
            time: timeInSeconds,
            text,
            speaker,
          });
        }
      }
    });

    return timestamped;
  };

  const generateHighlights = (transcription: string) => {
    // In a real implementation, this would use AI to identify highlights
    // For now, we'll return our mock highlights
    return mockHighlights;
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVideoUrl(e.target.value);
  };

  const handleTranscribe = () => {
    if (!videoUrl) {
      setError("Please enter a valid video URL");
      return;
    }

    // Set a placeholder video source for demonstration
    setVideoSource(
      "https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=800&q=80",
    );

    setError(null);
    setIsTranscribing(true);
    setProgress(0);

    // Simulate transcription process
    const interval = setInterval(() => {
      setProgress((prevProgress) => {
        const newProgress = prevProgress + 10;
        if (newProgress >= 100) {
          clearInterval(interval);
          setIsTranscribing(false);
          setTranscription(mockTranscription);
          const parsedTranscription =
            parseTimestampedTranscription(mockTranscription);
          setTimestampedTranscription(parsedTranscription);
          setHighlights(mockHighlights);
          onTranscriptionComplete({
            fullText: mockTranscription,
            timestamped: parsedTranscription,
            highlights: mockHighlights,
          });
          return 100;
        }
        return newProgress;
      });
    }, 500);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="w-full bg-background">
      <Card>
        <CardHeader>
          <CardTitle>Video Transcription & Highlights</CardTitle>
          <CardDescription>
            Enter a YouTube URL to transcribe audio and identify key highlights
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter YouTube URL"
              value={videoUrl}
              onChange={handleUrlChange}
              className="flex-1"
            />
            <Button
              onClick={handleTranscribe}
              disabled={isTranscribing || !videoUrl}
            >
              <FileText className="mr-2 h-4 w-4" />
              Process Video
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isTranscribing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processing video content...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Video Preview */}
          {videoSource && (
            <div className="mt-6">
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                {videoSource && videoSource.includes("youtube.com/embed") ? (
                  <iframe
                    src={videoSource}
                    className="w-full h-full"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video
                    ref={videoRef}
                    src={videoSource}
                    controls
                    className="w-full h-full"
                    poster={
                      typeof videoSource === "string" &&
                      !videoSource.startsWith("blob:")
                        ? videoSource
                        : undefined
                    }
                  />
                )}
              </div>
            </div>
          )}

          {transcription && timestampedTranscription && (
            <div className="mt-6 space-y-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="transcript">
                    <FileText className="mr-2 h-4 w-4" />
                    Full Transcript
                  </TabsTrigger>
                  <TabsTrigger value="highlights">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Key Highlights
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="transcript" className="mt-4 space-y-4">
                  <ScrollArea className="h-[400px] rounded-md border p-4">
                    <div className="space-y-4">
                      {timestampedTranscription.map((segment, index) => (
                        <div key={index} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center text-sm font-medium text-primary">
                              <Clock className="mr-1 h-4 w-4" />
                              {formatTime(segment.time)}
                            </div>
                            {segment.speaker && (
                              <Badge variant="outline" className="text-xs">
                                {segment.speaker}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm">{segment.text}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="highlights" className="mt-4 space-y-4">
                  <div className="rounded-md border p-4 bg-muted/30">
                    <h3 className="text-lg font-medium flex items-center mb-4">
                      <Star className="mr-2 h-5 w-5 text-yellow-500" />
                      {highlights.length} Key Moments Identified
                    </h3>
                    <div className="space-y-6">
                      {highlights.map((highlight) => (
                        <div
                          key={highlight.id}
                          className="bg-background rounded-lg p-4 border shadow-sm"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="text-md font-semibold">
                              {highlight.title}
                            </h4>
                            <Badge className="ml-2">
                              {formatTime(highlight.startTime)} -{" "}
                              {formatTime(highlight.endTime)}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            {highlight.summary}
                          </p>
                          <Separator className="my-2" />
                          <div className="bg-muted/30 p-3 rounded-md mt-2">
                            <p className="text-sm italic">
                              "{highlight.transcript}"
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setVideoUrl("")}>
                  New Video
                </Button>
                <Button>
                  <BookMarked className="mr-2 h-4 w-4" />
                  Save Results
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TranscriptionService;
