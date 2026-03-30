import React from "react";
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from "remotion";

type Cue = {
  start: number;
  end: number;
  text: string;
};

export const ClipVertical: React.FC<{ videoPath: string; cues: Cue[] }> = ({
  videoPath,
  cues,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const current = cues.find((c) => t >= c.start && t <= c.end);

  // Gentle motion for less static framing.
  const panX = Math.sin(t * 0.6) * 6;
  const zoom = 1.03 + Math.sin(t * 0.2) * 0.015;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AbsoluteFill
        style={{
          transform: `translateX(${panX}px) scale(${zoom})`,
          transformOrigin: "center center",
        }}
      >
        <OffthreadVideo
          src={videoPath}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </AbsoluteFill>

      {current?.text ? (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            paddingBottom: 220, // keep above Shorts/Reels UI
            paddingLeft: 44,
            paddingRight: 44,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              color: "white",
              fontWeight: 700,
              fontSize: 42,
              lineHeight: 1.22,
              textAlign: "center",
              textShadow:
                "0 2px 6px rgba(0,0,0,0.75), 0 0 2px rgba(0,0,0,0.7)",
              background: "rgba(0,0,0,0.55)",
              borderRadius: 18,
              padding: "12px 18px",
              maxWidth: "88%",
            }}
          >
            {current.text}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

