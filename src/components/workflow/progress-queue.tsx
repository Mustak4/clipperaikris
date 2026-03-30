import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClipResult } from "@/types/jobs";

type Props = {
  clips: ClipResult[];
};

export function ProgressQueue({ clips }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Render Queue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {clips.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clips in queue yet.</p>
        ) : (
          clips.map((clip) => (
            <div key={clip.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <span className="truncate">{clip.title}</span>
              <Badge variant={statusVariant(clip.status)} className="ml-auto">
                {clip.status}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "done") return "default";
  if (status === "error") return "destructive";
  if (status === "processing") return "secondary";
  return "outline";
}

