export {
  BAYER_2,
  BAYER_4,
  BAYER_8,
  BLUE_NOISE_64,
  DITHER_MATRICES,
  getThresholdMap,
  isInked,
  thresholdAt,
} from "@/lib/flow/dither/matrices";
export type { DitherMatrix, ThresholdMap } from "@/lib/flow/dither/matrices";

export {
  cssColor,
  DEFAULT_PALETTE,
  DITHER_COLOR_NAMES,
  DITHER_COLORS,
  MOTION,
} from "@/lib/flow/dither/tokens";
export type {
  DitherColor,
  DitherColorName,
  DitherPalette,
  Rgba,
} from "@/lib/flow/dither/tokens";

export {
  BLOOM_LEVELS,
  BLOOMS,
  bloomFilter,
  bloomLayerStyle,
  bloomStyle,
  ditherRamp,
  FILL_VARIANTS,
  fillStyle,
  fillTile,
  SERIES_COLORS,
  seriesColor,
} from "@/lib/flow/dither/style";
export type {
  Bloom,
  FillEdge,
  FillStyleOptions,
  FillTile,
  FillVariant,
  RampOptions,
  RampTile,
} from "@/lib/flow/dither/style";

export {
  readDitherCell,
  resolveColor,
  subscribeToTheme,
  useDitherColors,
} from "@/lib/flow/dither/color";

export {
  useDocumentVisible,
  useFrameLoop,
  useInView,
  usePrefersReducedMotion,
} from "@/lib/flow/dither/motion";
export type {
  FrameLoopCallback,
  FrameLoopOptions,
  FrameLoopState,
} from "@/lib/flow/dither/motion";

export { DitherShader, MAX_LIVE_CONTEXTS } from "@/lib/flow/dither/shader";
export type {
  DitherShaderProps,
  DitherShaderState,
  DitherUniforms,
  ShaderUniformValue,
} from "@/lib/flow/dither/shader";

export { BloomBox, BloomGroup, FillPattern } from "@/lib/flow/dither/fill";
export type {
  BloomBoxProps,
  BloomGroupProps,
  FillPatternProps,
  FillRamp,
} from "@/lib/flow/dither/fill";

export {
  DitherPattern,
  ditherMask,
  ditherMaskStyle,
  ditherPath,
} from "@/lib/flow/dither/pattern";
export type {
  DitherMaskOptions,
  DitherMaskStyleOptions,
  DitherPatternProps,
} from "@/lib/flow/dither/pattern";

export { DITHER_METHODS, ditherImage } from "@/lib/flow/dither/diffuse";
export type {
  DiffuseOptions,
  DiffusionMethod,
  DiffusionOptions,
  DitherMethod,
  ImagePalette,
  OrderedMethod,
  OrderedOptions,
  PaletteColor,
  PixelBuffer,
} from "@/lib/flow/dither/diffuse";
