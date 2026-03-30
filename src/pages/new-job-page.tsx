import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileVideo, Link as LinkIcon, Loader2, Sparkles } from "lucide-react";
import { createJob } from "@/lib/jobs-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function NewJobPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("file");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = (activeTab === "file" && videoFile) || (activeTab === "url" && youtubeUrl.trim());

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await createJob({
        file: activeTab === "file" ? videoFile || undefined : undefined,
        youtubeUrl: activeTab === "url" ? youtubeUrl.trim() : undefined,
      });
      navigate(`/jobs/${result.jobId}/analysis`, {
        state: {
          localPreviewUrl: videoFile ? URL.createObjectURL(videoFile) : null,
        },
      });
    } catch (err: any) {
      setError(err?.message || "Failed to create job");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Job</CardTitle>
        <CardDescription>Upload a video or paste a YouTube URL.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="file">
              <FileVideo className="mr-2 h-4 w-4" />
              Video File
            </TabsTrigger>
            <TabsTrigger value="url">
              <LinkIcon className="mr-2 h-4 w-4" />
              YouTube URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="mt-4 grid gap-2">
            <Label htmlFor="file-input">Select video</Label>
            <Input
              id="file-input"
              type="file"
              accept="video/*"
              onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
            />
          </TabsContent>

          <TabsContent value="url" className="mt-4 grid gap-2">
            <Label htmlFor="youtube-input">YouTube URL</Label>
            <Input
              id="youtube-input"
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
            />
          </TabsContent>
        </Tabs>

        <Button size="lg" disabled={!canSubmit || loading} onClick={handleSubmit}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Analyze Video
        </Button>
      </CardContent>
    </Card>
  );
}

