import { layoutWithLines, type PreparedTextWithSegments } from '@chenglou/pretext';

import {
  FORCE_FIELD_ACTIVE_COLOR,
  FORCE_FIELD_BASELINE_RATIO,
  FORCE_FIELD_GLASS_BORDER_BOTTOM,
  FORCE_FIELD_GLASS_BORDER_TOP,
  FORCE_FIELD_GLASS_BOTTOM_TINT,
  FORCE_FIELD_GLASS_MID_TINT,
  FORCE_FIELD_GLASS_SWEEP_SPEED,
  FORCE_FIELD_GLASS_SWEEP_TINT,
  FORCE_FIELD_GLASS_TOP_HIGHLIGHT,
  FORCE_FIELD_GLASS_TOP_TINT,
  FORCE_FIELD_GLASS_UPPER_MID_TINT,
  FORCE_FIELD_IDLE_COLOR,
  FORCE_FIELD_LABEL_COLOR,
  FORCE_FIELD_LABEL_FONT,
  FORCE_FIELD_LABEL_OFFSET_Y,
  FORCE_FIELD_LABEL_TRACKING_EM,
  FORCE_FIELD_POINTER_GLOW_CENTER,
  FORCE_FIELD_POINTER_GLOW_MID,
  FORCE_FIELD_TEXT_SHADOW_BLUR,
  FORCE_FIELD_TEXT_SHADOW_COLOR,
  FORCE_FIELD_TEXT_SHADOW_OFFSET_Y,
  type RgbaColor,
} from './constants';

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});

export type ForceFieldParticle = {
  char: string;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type ForceFieldPointer = {
  x: number;
  y: number;
  active: boolean;
};

export type ForceFieldPhysicsConfig = {
  forceRadius: number;
  forceStrength: number;
  springK: number;
  damping: number;
  maxVelocity: number;
  dtCap: number;
};

export type ColumnGeometry = {
  startX: number;
  startY: number;
  columnWidth: number;
  lineCount: number;
};

export type TwoColumnGeometry = {
  left: ColumnGeometry;
  right: ColumnGeometry;
  totalWidth: number;
  blockHeight: number;
  blockTopY: number;
};

type MeasureText = (text: string) => number;

type ComputeTwoColumnGeometryOptions = {
  leftPrepared: PreparedTextWithSegments;
  rightPrepared: PreparedTextWithSegments;
  viewportWidth: number;
  viewportHeight: number;
  lineHeight: number;
  textPadding: number;
  columnWidth: number;
  columnGutter: number;
};

type BuildTwoColumnForceFieldParticlesOptions = ComputeTwoColumnGeometryOptions & {
  measureText: MeasureText;
};

type BuildTwoColumnForceFieldParticlesResult = {
  particles: ForceFieldParticle[];
  geometry: TwoColumnGeometry | null;
};

type RenderForceFieldOptions = {
  ctx: CanvasRenderingContext2D;
  particles: ForceFieldParticle[];
  pointer: ForceFieldPointer;
  viewportWidth: number;
  viewportHeight: number;
  pointerRadius: number;
  time: number;
  geometry?: TwoColumnGeometry | null;
  labels?: { left: string; right: string };
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function tint(color: RgbaColor): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
}

function withAlpha(color: RgbaColor, alpha: number): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function drawGlassSurface(
  ctx: CanvasRenderingContext2D,
  viewportWidth: number,
  viewportHeight: number,
  time: number,
): void {
  // Four-stop vertical gradient — darker at edges, clearer in the middle.
  const edgeGradient = ctx.createLinearGradient(0, 0, 0, viewportHeight);
  edgeGradient.addColorStop(0, tint(FORCE_FIELD_GLASS_TOP_TINT));
  edgeGradient.addColorStop(0.18, tint(FORCE_FIELD_GLASS_UPPER_MID_TINT));
  edgeGradient.addColorStop(0.55, tint(FORCE_FIELD_GLASS_MID_TINT));
  edgeGradient.addColorStop(1, tint(FORCE_FIELD_GLASS_BOTTOM_TINT));

  ctx.fillStyle = edgeGradient;
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  // Specular highlight at the very top edge — reads as beveled light.
  const topHighlight = ctx.createLinearGradient(0, 0, 0, 26);
  topHighlight.addColorStop(0, tint(FORCE_FIELD_GLASS_TOP_HIGHLIGHT));
  topHighlight.addColorStop(1, withAlpha(FORCE_FIELD_GLASS_TOP_HIGHLIGHT, 0));

  ctx.fillStyle = topHighlight;
  ctx.fillRect(0, 0, viewportWidth, 26);

  // Hairline border: cool silver TL → warm brass BR (subtle metal vibe).
  const borderGradient = ctx.createLinearGradient(0, 0, viewportWidth, viewportHeight);
  borderGradient.addColorStop(0, tint(FORCE_FIELD_GLASS_BORDER_TOP));
  borderGradient.addColorStop(0.5, withAlpha(FORCE_FIELD_GLASS_BORDER_TOP, 0.04));
  borderGradient.addColorStop(1, tint(FORCE_FIELD_GLASS_BORDER_BOTTOM));

  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 1;
  ctx.strokeRect(18, 18, viewportWidth - 36, viewportHeight - 36);

  // Slow moonlight sweep.
  const sweepWidth = Math.max(180, viewportWidth * 0.24);
  const sweepX =
    ((time * FORCE_FIELD_GLASS_SWEEP_SPEED) % (viewportWidth + sweepWidth * 2)) - sweepWidth;
  const sweepGradient = ctx.createLinearGradient(0, 0, sweepWidth, 0);
  sweepGradient.addColorStop(0, withAlpha(FORCE_FIELD_GLASS_SWEEP_TINT, 0));
  sweepGradient.addColorStop(0.5, tint(FORCE_FIELD_GLASS_SWEEP_TINT));
  sweepGradient.addColorStop(1, withAlpha(FORCE_FIELD_GLASS_SWEEP_TINT, 0));

  ctx.save();
  ctx.translate(sweepX, 0);
  ctx.rotate(-0.18);
  ctx.fillStyle = sweepGradient;
  ctx.fillRect(-viewportHeight, -viewportHeight * 0.15, sweepWidth, viewportHeight * 1.9);
  ctx.restore();
}

function drawPointerGlow(
  ctx: CanvasRenderingContext2D,
  pointer: ForceFieldPointer,
  pointerRadius: number,
): void {
  if (!pointer.active) {
    return;
  }

  const glow = ctx.createRadialGradient(
    pointer.x,
    pointer.y,
    0,
    pointer.x,
    pointer.y,
    pointerRadius,
  );
  glow.addColorStop(0, tint(FORCE_FIELD_POINTER_GLOW_CENTER));
  glow.addColorStop(0.55, tint(FORCE_FIELD_POINTER_GLOW_MID));
  glow.addColorStop(1, withAlpha(FORCE_FIELD_POINTER_GLOW_MID, 0));

  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, pointerRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.closePath();
}

function drawColumnLabels(
  ctx: CanvasRenderingContext2D,
  labels: { left: string; right: string },
  geometry: TwoColumnGeometry,
): void {
  ctx.save();
  ctx.font = FORCE_FIELD_LABEL_FONT;
  ctx.fillStyle = tint(FORCE_FIELD_LABEL_COLOR);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // letterSpacing is Chromium 94+ / Safari 16.4+ / Firefox 105+.
  // Assigning to unsupported contexts is a silent no-op on older runtimes.
  const spaceable = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  const previousLetterSpacing = spaceable.letterSpacing;
  spaceable.letterSpacing = `${FORCE_FIELD_LABEL_TRACKING_EM}em`;

  const labelY = geometry.blockTopY - FORCE_FIELD_LABEL_OFFSET_Y;
  ctx.fillText(labels.left.toUpperCase(), geometry.left.startX, labelY);
  ctx.fillText(labels.right.toUpperCase(), geometry.right.startX, labelY);

  if (previousLetterSpacing !== undefined) {
    spaceable.letterSpacing = previousLetterSpacing;
  }
  ctx.restore();
}

export function computeTwoColumnGeometry({
  leftPrepared,
  rightPrepared,
  viewportWidth,
  viewportHeight,
  lineHeight,
  textPadding,
  columnWidth,
  columnGutter,
}: ComputeTwoColumnGeometryOptions): TwoColumnGeometry | null {
  const totalWidth = columnWidth * 2 + columnGutter;

  if (totalWidth <= 0) {
    return null;
  }

  if (totalWidth > viewportWidth - textPadding * 2) {
    return null;
  }

  const leftLayout = layoutWithLines(leftPrepared, columnWidth, lineHeight);
  const rightLayout = layoutWithLines(rightPrepared, columnWidth, lineHeight);
  const lineCount = Math.max(leftLayout.lineCount, rightLayout.lineCount);

  if (lineCount <= 0) {
    return null;
  }

  const blockHeight = lineCount * lineHeight;
  const blockTopY = Math.max(textPadding, (viewportHeight - blockHeight) / 2);

  if (blockTopY + blockHeight > viewportHeight - textPadding) {
    return null;
  }

  const leftStartX = Math.round((viewportWidth - totalWidth) / 2);
  const rightStartX = leftStartX + columnWidth + columnGutter;

  return {
    left: {
      startX: leftStartX,
      startY: blockTopY,
      columnWidth,
      lineCount: leftLayout.lineCount,
    },
    right: {
      startX: rightStartX,
      startY: blockTopY,
      columnWidth,
      lineCount: rightLayout.lineCount,
    },
    totalWidth,
    blockHeight,
    blockTopY,
  };
}

function emitParticlesForColumn(
  prepared: PreparedTextWithSegments,
  geometry: ColumnGeometry,
  lineHeight: number,
  measureText: MeasureText,
): ForceFieldParticle[] {
  const layout = layoutWithLines(prepared, geometry.columnWidth, lineHeight);
  const particles: ForceFieldParticle[] = [];

  for (let lineIndex = 0; lineIndex < layout.lines.length; lineIndex += 1) {
    const line = layout.lines[lineIndex]!;
    const lineY = geometry.startY + lineIndex * lineHeight;
    let cursorX = geometry.startX;

    for (const { segment: character } of graphemeSegmenter.segment(line.text)) {
      const characterWidth = measureText(character);

      if (character.trim().length === 0) {
        cursorX += characterWidth;
        continue;
      }

      particles.push({
        char: character,
        homeX: cursorX + characterWidth / 2,
        homeY: lineY + lineHeight * FORCE_FIELD_BASELINE_RATIO,
        x: cursorX + characterWidth / 2,
        y: lineY + lineHeight * FORCE_FIELD_BASELINE_RATIO,
        vx: 0,
        vy: 0,
      });

      cursorX += characterWidth;
    }
  }

  return particles;
}

export function buildTwoColumnForceFieldParticles(
  options: BuildTwoColumnForceFieldParticlesOptions,
): BuildTwoColumnForceFieldParticlesResult {
  const geometry = computeTwoColumnGeometry(options);

  if (!geometry) {
    return { particles: [], geometry: null };
  }

  const leftParticles = emitParticlesForColumn(
    options.leftPrepared,
    geometry.left,
    options.lineHeight,
    options.measureText,
  );
  const rightParticles = emitParticlesForColumn(
    options.rightPrepared,
    geometry.right,
    options.lineHeight,
    options.measureText,
  );

  return {
    particles: [...leftParticles, ...rightParticles],
    geometry,
  };
}

export function simulateParticles(
  particles: ForceFieldParticle[],
  pointer: ForceFieldPointer,
  dt: number,
  physics: ForceFieldPhysicsConfig,
): void {
  if (!Number.isFinite(dt) || dt <= 0) {
    return;
  }

  const forceRadiusSquared = physics.forceRadius * physics.forceRadius;

  for (let index = 0; index < particles.length; index += 1) {
    const particle = particles[index]!;
    let fx = 0;
    let fy = 0;

    if (pointer.active) {
      const dx = particle.x - pointer.x;
      const dy = particle.y - pointer.y;
      const distanceSquared = dx * dx + dy * dy;

      if (distanceSquared < forceRadiusSquared && distanceSquared > 0.01) {
        const distance = Math.sqrt(distanceSquared);
        const t = 1 - distance / physics.forceRadius;
        const forceMagnitude = physics.forceStrength * t * t * t;
        fx += (dx / distance) * forceMagnitude;
        fy += (dy / distance) * forceMagnitude;
      }
    }

    fx += (particle.homeX - particle.x) * physics.springK;
    fy += (particle.homeY - particle.y) * physics.springK;

    particle.vx = (particle.vx + fx * dt) * physics.damping;
    particle.vy = (particle.vy + fy * dt) * physics.damping;

    const speed = Math.hypot(particle.vx, particle.vy);
    if (speed > physics.maxVelocity) {
      const scale = physics.maxVelocity / speed;
      particle.vx *= scale;
      particle.vy *= scale;
    }

    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
  }
}

export function getMaxParticleDisplacement(particles: ForceFieldParticle[]): number {
  return particles.reduce((maxDisplacement, particle) => {
    const displacement = Math.hypot(
      particle.x - particle.homeX,
      particle.y - particle.homeY,
    );
    return Math.max(maxDisplacement, displacement);
  }, 0);
}

export function renderForceField({
  ctx,
  particles,
  pointer,
  viewportWidth,
  viewportHeight,
  pointerRadius,
  time,
  geometry,
  labels,
}: RenderForceFieldOptions): void {
  ctx.clearRect(0, 0, viewportWidth, viewportHeight);

  drawGlassSurface(ctx, viewportWidth, viewportHeight, time);
  drawPointerGlow(ctx, pointer, pointerRadius);

  if (labels && geometry) {
    drawColumnLabels(ctx, labels, geometry);
  }

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = FORCE_FIELD_TEXT_SHADOW_COLOR;
  ctx.shadowBlur = FORCE_FIELD_TEXT_SHADOW_BLUR;
  ctx.shadowOffsetY = FORCE_FIELD_TEXT_SHADOW_OFFSET_Y;

  for (let index = 0; index < particles.length; index += 1) {
    const particle = particles[index]!;
    const displacement = Math.hypot(
      particle.x - particle.homeX,
      particle.y - particle.homeY,
    );
    const t = clamp(displacement / 80, 0, 1);
    const r = Math.round(lerp(FORCE_FIELD_IDLE_COLOR.r, FORCE_FIELD_ACTIVE_COLOR.r, t));
    const g = Math.round(lerp(FORCE_FIELD_IDLE_COLOR.g, FORCE_FIELD_ACTIVE_COLOR.g, t));
    const b = Math.round(lerp(FORCE_FIELD_IDLE_COLOR.b, FORCE_FIELD_ACTIVE_COLOR.b, t));
    const alpha = lerp(FORCE_FIELD_IDLE_COLOR.a, FORCE_FIELD_ACTIVE_COLOR.a, t);

    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.fillText(particle.char, particle.x, particle.y);
  }

  ctx.restore();
}
