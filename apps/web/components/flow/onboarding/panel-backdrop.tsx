"use client";

import { DitherShader, type DitherShaderProps } from "@/lib/flow/dither";

// Slow clouds of soft grey dots that gather toward the panel's edges and corners and
// thin out to clear ground in the middle, where the panel's content sits.
const FIELD = /* glsl */ `
float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);

  float clouds = fbm(p * backdropScale + vec2(t * 0.025, t * -0.012));
  float drift = fbm(p * backdropScale * 0.5 - vec2(t * 0.01, 0.0));

  // Distance outside the content's box, in uv (y up: the centre sits a little
  // low, where the orbit and its caption are)
  vec2 out_ = max(abs(uv - backdropCentre) - backdropClear, 0.0);
  float away = length(out_ * vec2(aspect, 1.0));
  // Light everywhere, heavier past the content toward the edges. Behind the
  // content it stays near a tenth, so text on the panel keeps its contrast
  float clear = mix(0.05, 1.0, smoothstep(0.02, 0.16, away));
  float edge = smoothstep(0.02, 0.4, away);

  float tone = (clouds * 0.7 + drift * 0.3) + edge * 0.4 - 0.36;
  return clamp(tone, 0.0, 1.0) * clear * backdropStrength;
}
`;

export type PanelBackdropProps = Omit<
  DitherShaderProps,
  "field" | "colorField" | "uniforms" | "fallback" | "palette"
> & {
  /** Cloud size: bigger numbers, smaller clouds. */
  scale?: number;
  /** Peak density, 0 to 1. */
  strength?: number;
};

/** The setup panels' backdrop: soft grey dither on white, clear in the middle. */
export function PanelBackdrop({ scale = 1.8, strength = 0.8, className, ...props }: PanelBackdropProps) {
  return (
    <DitherShader
      field={FIELD}
      uniforms={{ backdropScale: scale, backdropStrength: strength, backdropClear: [0.3, 0.33], backdropCentre: [0.5, 0.45] }}
      // Soft grey dots on white: two colours, nothing in between (see --texture)
      palette={["--card", "--texture"]}
      matrix="bayer4"
      speed={1}
      stillTime={12}
      fallback={<div className="absolute inset-0 bg-card" />}
      className={className ?? "absolute inset-0"}
      {...props}
    />
  );
}
