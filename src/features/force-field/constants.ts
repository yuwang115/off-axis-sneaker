import type { ForceFieldPhysicsConfig } from './engine';

export const FORCE_FIELD_FONT_FAMILY =
  '"Iowan Old Style", "Palatino Linotype", "Noto Serif SC", "Songti SC", serif';
export const FORCE_FIELD_FONT_SIZE = 28;
export const FORCE_FIELD_LINE_HEIGHT = 46;
export const FORCE_FIELD_FONT = `${FORCE_FIELD_FONT_SIZE}px ${FORCE_FIELD_FONT_FAMILY}`;
export const FORCE_FIELD_TEXT_PADDING = 72;
export const FORCE_FIELD_MAX_TEXT_WIDTH = 760;
export const FORCE_FIELD_BASELINE_RATIO = 0.72;

export const FORCE_FIELD_PHYSICS: ForceFieldPhysicsConfig = {
  forceRadius: 150,
  forceStrength: 8000,
  springK: 120,
  damping: 0.88,
  maxVelocity: 800,
  dtCap: 0.05,
};

export const FORCE_FIELD_IDLE_COLOR = { r: 237, g: 235, b: 228, a: 0.95 };
export const FORCE_FIELD_ACTIVE_COLOR = { r: 208, g: 179, b: 120, a: 0.82 };

export const FORCE_FIELD_GLASS_EDGE_ALPHA = 0.08;
export const FORCE_FIELD_GLASS_FILL_ALPHA = 0.035;
export const FORCE_FIELD_SWEEP_ALPHA = 0.05;
