import React from "react";
import { Composition, registerRoot } from "remotion";
import { ClipVertical } from "./ClipVertical";

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

type Props = {
  videoPath: string;
  cues: Cue[];
  srcW: number;
  srcH: number;
  durationInFrames?: number;
  durationSeconds?: number;
  keyframes?: ReframeKeyframe[];
  captionPreset?: "clean" | "bold" | "neon";
  ctaText?: string;
};

const Root: React.FC = () => {
  return (
    <Composition
      id="ClipVertical"
      component={ClipVertical}
      width={1080}
      height={1920}
      fps={25}
      durationInFrames={900}
      defaultProps={{
        videoPath: "",
        cues: [],
        srcW: 1920,
        srcH: 1080,
        durationInFrames: 900,
        durationSeconds: 30,
        keyframes: [],
      }}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, (props as Props).durationInFrames ?? 900),
      })}
    />
  );
};

registerRoot(Root);

