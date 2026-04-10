import type { ForceFieldPhysicsConfig } from './engine';

export type RgbaColor = { r: number; g: number; b: number; a: number };

export const FORCE_FIELD_FONT_FAMILY =
  '"Cormorant Garamond", "Iowan Old Style", "Palatino Linotype", Garamond, serif';
export const FORCE_FIELD_FONT_WEIGHT = 300;
export const FORCE_FIELD_FONT_SIZE = 30;
export const FORCE_FIELD_LINE_HEIGHT = 50;
export const FORCE_FIELD_FONT = `${FORCE_FIELD_FONT_WEIGHT} ${FORCE_FIELD_FONT_SIZE}px ${FORCE_FIELD_FONT_FAMILY}`;
export const FORCE_FIELD_TEXT_PADDING = 72;
export const FORCE_FIELD_BASELINE_RATIO = 0.7;

export const FORCE_FIELD_COLUMN_WIDTH = 340;
export const FORCE_FIELD_COLUMN_GUTTER = 120;

export const FORCE_FIELD_LABEL_FONT_FAMILY = '"Inter", "Helvetica Neue", sans-serif';
export const FORCE_FIELD_LABEL_FONT_SIZE = 11;
export const FORCE_FIELD_LABEL_FONT_WEIGHT = 500;
export const FORCE_FIELD_LABEL_FONT = `${FORCE_FIELD_LABEL_FONT_WEIGHT} ${FORCE_FIELD_LABEL_FONT_SIZE}px ${FORCE_FIELD_LABEL_FONT_FAMILY}`;
export const FORCE_FIELD_LABEL_TRACKING_EM = 0.32;
export const FORCE_FIELD_LABEL_OFFSET_Y = 38;

export const FORCE_FIELD_PHYSICS: ForceFieldPhysicsConfig = {
  forceRadius: 150,
  forceStrength: 8000,
  springK: 120,
  damping: 0.88,
  maxVelocity: 800,
  dtCap: 0.05,
};

// Text — warm ivory idle, soft stone active (pale against dark glass)
export const FORCE_FIELD_IDLE_COLOR: RgbaColor = { r: 242, g: 238, b: 228, a: 0.94 };
export const FORCE_FIELD_ACTIVE_COLOR: RgbaColor = { r: 198, g: 188, b: 168, a: 0.72 };

// Four-stop vertical gradient — MIDDLE is the MOST transparent so the Three.js
// shoe remains visible through the reading band (vignette-of-darkness effect).
export const FORCE_FIELD_GLASS_TOP_TINT: RgbaColor = { r: 14, g: 16, b: 22, a: 0.58 };
export const FORCE_FIELD_GLASS_UPPER_MID_TINT: RgbaColor = { r: 10, g: 12, b: 18, a: 0.42 };
export const FORCE_FIELD_GLASS_MID_TINT: RgbaColor = { r: 6, g: 8, b: 14, a: 0.22 };
export const FORCE_FIELD_GLASS_BOTTOM_TINT: RgbaColor = { r: 4, g: 6, b: 12, a: 0.62 };

// Border: cool silver hairline top → warm brass bottom (subtle metal feel)
export const FORCE_FIELD_GLASS_BORDER_TOP: RgbaColor = { r: 220, g: 220, b: 230, a: 0.22 };
export const FORCE_FIELD_GLASS_BORDER_BOTTOM: RgbaColor = { r: 140, g: 110, b: 70, a: 0.1 };

// Top edge specular highlight (bright hairline at y=0..24, reads as beveled light)
export const FORCE_FIELD_GLASS_TOP_HIGHLIGHT: RgbaColor = { r: 255, g: 255, b: 255, a: 0.06 };

// Slow moonlight sweep
export const FORCE_FIELD_GLASS_SWEEP_TINT: RgbaColor = { r: 220, g: 228, b: 248, a: 0.035 };
export const FORCE_FIELD_GLASS_SWEEP_SPEED = 28;

// Pointer glow — warm amber → copper fade, contrasts the cool dark
export const FORCE_FIELD_POINTER_GLOW_CENTER: RgbaColor = { r: 244, g: 200, b: 150, a: 0.18 };
export const FORCE_FIELD_POINTER_GLOW_MID: RgbaColor = { r: 240, g: 180, b: 130, a: 0.05 };

// Text shadow for depth on dark glass
export const FORCE_FIELD_TEXT_SHADOW_COLOR = 'rgba(0, 0, 0, 0.55)';
export const FORCE_FIELD_TEXT_SHADOW_BLUR = 5;
export const FORCE_FIELD_TEXT_SHADOW_OFFSET_Y = 1.5;

// Column label color (dim warm ivory — recedes vs body text)
export const FORCE_FIELD_LABEL_COLOR: RgbaColor = { r: 242, g: 238, b: 228, a: 0.55 };
