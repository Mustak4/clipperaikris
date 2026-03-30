import { useMemo } from "react";
import { Download, FolderOpen } from "lucide-react";
import { clipSrtUrl, clipVideoUrl } from "@/lib/jobs-api";
import { formatDate, formatTime } from "@/lib/format";
import { getLibraryEntries } from "@/lib/library-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LibraryPage() {
  const entries = useMemo(() => getLibraryEntries(), []);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Clip Library</CardTitle>
          <CardDescription>Previously rendered clips and subtitle downloads.</CardDescription>
        </CardHeader>
      </Card>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <FolderOpen className="h-4 w-4" />
            No clips yet. Generate a job to populate this library.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {entries.map((entry) => (
            <Card key={`${entry.jobId}:${entry.id}`}>
              <CardHeader>
                <CardTitle className="text-base">{entry.title}</CardTitle>
                <CardDescription>{formatDate(entry.createdAt)}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="aspect-[9/16] max-h-[420px] overflow-hidden rounded-md bg-black">
                  <video
                    src={clipVideoUrl(entry.jobId, entry.id)}
                    controls
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{entry.captionPreset}</Badge>
                  <Badge variant="outline">{entry.renderEngine}</Badge>
                  <Badge variant="outline">
                    {formatTime(entry.startTime)} - {formatTime(entry.endTime)}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={clipSrtUrl(entry.jobId, entry.id)} download={`${entry.title}.srt`}>
                      <Download className="mr-1 h-3 w-3" />
                      SRT
                    </a>
                  </Button>
                  <Button asChild size="sm">
                    <a href={clipVideoUrl(entry.jobId, entry.id)} download={`${entry.title}.mp4`}>
                      <Download className="mr-1 h-3 w-3" />
                      Video
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

