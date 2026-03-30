import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { formatTime } from "@/lib/format";

type Props = {
  videoUrl: string | null;
  startTime: number;
  endTime: number;
  min: number;
  max: number;
  onChange: (next: { startTime: number; endTime: number }) => void;
};

export function TimelinePreview({
  videoUrl,
  startTime,
  endTime,
  min,
  max,
  onChange,
}: Props) {
  const [cursor, setCursor] = useState(startTime);
  const durationLabel = useMemo(
    () => `${formatTime(startTime)} - ${formatTime(endTime)} (${Math.round(endTime - startTime)}s)`,
    [endTime, startTime],
  );

  return (
    <div className="grid gap-3">
      <div className="aspect-video overflow-hidden rounded-lg bg-black">
        {videoUrl ? (
          <video
            key={videoUrl}
            src={videoUrl}
            controls
            className="h-full w-full"
            onTimeUpdate={(e) => setCursor(e.currentTarget.currentTime)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Preview appears after video upload.
          </div>
        )}
      </div>

      <div className="grid gap-2 rounded-md border p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Trim Range</span>
          <span className="text-muted-foreground">{durationLabel}</span>
        </div>
        <Slider
          min={min}
          max={max}
          value={[startTime, endTime]}
          step={0.25}
          onValueChange={(val) =>
            onChange({
              startTime: Math.max(min, Math.min(val[0], val[1] - 5)),
              endTime: Math.min(max, Math.max(val[0] + 5, val[1])),
            })
          }
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>In: {formatTime(startTime)}</span>
          <span>Playhead: {formatTime(cursor)}</span>
          <span>Out: {formatTime(endTime)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <RangeNudge label="-1s in" onClick={() => onChange({ startTime: Math.max(min, startTime - 1), endTime })} />
          <RangeNudge label="+1s in" onClick={() => onChange({ startTime: Math.min(endTime - 5, startTime + 1), endTime })} />
          <RangeNudge label="-1s out" onClick={() => onChange({ startTime, endTime: Math.max(startTime + 5, endTime - 1) })} />
          <RangeNudge label="+1s out" onClick={() => onChange({ startTime, endTime: Math.min(max, endTime + 1) })} />
        </div>
      </div>
    </div>
  );
}

function RangeNudge({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="grid gap-1">
      <Label className="sr-only">{label}</Label>
      <Button variant="outline" size="sm" onClick={onClick}>
        {label}
      </Button>
    </div>
  );
}

