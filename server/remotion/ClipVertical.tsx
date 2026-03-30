import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type Cue = {
  start: number;
  end: number;
  text: string;
};

type ReframeKeyframe = {
  t: number;
  centerX: number;
  zoom: number;
};

export const ClipVertical: React.FC<{
  videoPath: string;
  cues: Cue[];
  srcW: number;
  srcH: number;
  keyframes?: ReframeKeyframe[];
  captionPreset?: "clean" | "bold" | "neon";
  ctaText?: string;
  durationSeconds?: number;
}> = ({
  videoPath,
  cues,
  srcW,
  srcH,
  keyframes = [],
  captionPreset = "bold",
  ctaText = "FOLLOW FOR MORE",
  durationSeconds,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const current = cues.find((c) => t >= c.start && t <= c.end);

  const outW = 1080;
  const outH = 1920;
  // Slight extra scale ensures full coverage (less risk of "small centered rectangle").
  // Slight extra scale ensures full coverage (less risk of "small centered rectangle").
  const baseScale = Math.max(outW / srcW, outH / srcH) * 1.18;

  const timeline =
    keyframes.length >= 2
      ? keyframes
      : [
          { t: 0, centerX: srcW * 0.5, zoom: 1.2 },
          { t: 9999, centerX: srcW * 0.5, zoom: 1.2 },
        ];

  const x = interpolate(
    t,
    timeline.map((k) => k.t),
    timeline.map((k) => k.centerX),
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const zoom = interpolate(
    t,
    timeline.map((k) => k.t),
    timeline.map((k) => k.zoom),
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const scaledW = srcW * baseScale * zoom;
  const scaledH = srcH * baseScale * zoom;
  const centerXpx = x * baseScale * zoom;
  const txRaw = outW / 2 - centerXpx;
  const minTx = outW - scaledW;
  const tx = Math.max(minTx, Math.min(0, txRaw));
  const ty = Math.min(0, outH - scaledH) / 2;

  const clipSeconds = typeof durationSeconds === "number" ? durationSeconds : durationInFrames / fps;
  // Start a bit earlier to ensure it is visible even when captions overlap.
  const ctaStart = Math.max(0, clipSeconds - 3);
  const ctaOpacity = interpolate(t, [ctaStart, ctaStart + 0.25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const captionStyleByPreset: Record<string, React.CSSProperties> = {
    clean: {
      fontSize: 54,
      background: "rgba(0,0,0,0.52)",
      color: "white",
      textShadow: "0 2px 8px rgba(0,0,0,0.65)",
    },
    bold: {
      fontSize: 58,
      background: "rgba(0,0,0,0.52)",
      color: "white",
      textShadow: "0 2px 8px rgba(0,0,0,0.7)",
    },
    neon: {
      fontSize: 56,
      background: "rgba(0,0,0,0.45)",
      color: "white",
      textShadow: "0 0 14px rgba(55,200,255,0.85), 0 2px 10px rgba(0,0,0,0.7)",
    },
  };

  const mergedCaptionStyle: React.CSSProperties = {
    fontWeight: 700,
    lineHeight: 1.22,
    textAlign: "center",
    borderRadius: 18,
    padding: "12px 22px",
    maxWidth: "90%",
    pointerEvents: "none",
    ...captionStyleByPreset[captionPreset]!,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AbsoluteFill
        style={{
          overflow: "hidden",
        }}
      >
        <OffthreadVideo
          src={videoPath}
          style={{
            width: scaledW,
            height: scaledH,
            position: "absolute",
            top: 0,
            left: 0,
            transform: `translate(${tx}px, ${ty}px)`,
            objectFit: "cover",
            willChange: "transform",
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
            zIndex: 5,
          }}
        >
          <div
            style={{
              ...mergedCaptionStyle,
            }}
          >
            {current.text}
          </div>
        </AbsoluteFill>
      ) : null}

      {/* End card CTA (last ~1.15s) */}
      {ctaText ? (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            paddingBottom: 140,
            paddingLeft: 48,
            paddingRight: 48,
            pointerEvents: "none",
            zIndex: 10,
            opacity: ctaOpacity,
          }}
        >
          <div
            style={{
              color: "white",
              fontWeight: 900,
              fontSize: 54,
              lineHeight: 1.1,
              textAlign: "center",
              textTransform: "uppercase",
              background: "rgba(0,0,0,0.5)",
              borderRadius: 22,
              padding: "18px 28px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
            }}
          >
            {ctaText}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

