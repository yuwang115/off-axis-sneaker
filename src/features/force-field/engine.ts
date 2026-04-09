import { layoutWithLines, type PreparedTextWithSegments } from '@chenglou/pretext';

import {
  FORCE_FIELD_ACTIVE_COLOR,
  FORCE_FIELD_BASELINE_RATIO,
  FORCE_FIELD_GLASS_EDGE_ALPHA,
  FORCE_FIELD_GLASS_FILL_ALPHA,
  FORCE_FIELD_IDLE_COLOR,
  FORCE_FIELD_SWEEP_ALPHA,
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

type BuildForceFieldParticlesOptions = {
  prepared: PreparedTextWithSegments;
  viewportWidth: number;
  viewportHeight: number;
  lineHeight: number;
  textPadding: number;
  maxTextWidth: number;
  measureText: (text: string) => number;
};

type RenderForceFieldOptions = {
  ctx: CanvasRenderingContext2D;
  particles: ForceFieldParticle[];
  pointer: ForceFieldPointer;
  viewportWidth: number;
  viewportHeight: number;
  pointerRadius: number;
  time: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function drawGlassSurface(
  ctx: CanvasRenderingContext2D,
  viewportWidth: number,
  viewportHeight: number,
  time: number,
): void {
  const edgeGradient = ctx.createLinearGradient(0, 0, 0, viewportHeight);
  edgeGradient.addColorStop(0, `rgba(255, 255, 255, ${FORCE_FIELD_GLASS_EDGE_ALPHA})`);
  edgeGradient.addColorStop(0.18, `rgba(255, 255, 255, ${FORCE_FIELD_GLASS_FILL_ALPHA})`);
  edgeGradient.addColorStop(0.75, 'rgba(255, 255, 255, 0)');
  edgeGradient.addColorStop(1, `rgba(170, 190, 255, ${FORCE_FIELD_GLASS_FILL_ALPHA})`);

  ctx.fillStyle = edgeGradient;
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  const borderGradient = ctx.createLinearGradient(0, 0, viewportWidth, viewportHeight);
  borderGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
  borderGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
  borderGradient.addColorStop(1, 'rgba(141, 168, 255, 0.12)');

  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 1;
  ctx.strokeRect(18, 18, viewportWidth - 36, viewportHeight - 36);

  const sweepWidth = Math.max(180, viewportWidth * 0.24);
  const sweepX = ((time * 70) % (viewportWidth + sweepWidth * 2)) - sweepWidth;
  const sweepGradient = ctx.createLinearGradient(0, 0, sweepWidth, 0);
  sweepGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  sweepGradient.addColorStop(0.5, `rgba(255, 255, 255, ${FORCE_FIELD_SWEEP_ALPHA})`);
  sweepGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.save();
  ctx.translate(sweepX, 0);
  ctx.rotate(-0.18);
  ctx.fillStyle = sweepGradient;
  ctx.fillRect(-viewportHeight, -viewportHeight * 0.15, sweepWidth, viewportHeight * 1.9);
  ctx.restore();
}

export function buildForceFieldParticles({
  prepared,
  viewportWidth,
  viewportHeight,
  lineHeight,
  textPadding,
  maxTextWidth,
  measureText,
}: BuildForceFieldParticlesOptions): ForceFieldParticle[] {
  const allowedWidth = viewportWidth - textPadding * 2;
  const textBlockWidth = Math.min(allowedWidth, maxTextWidth);

  if (textBlockWidth <= 0) {
    return [];
  }

  const result = layoutWithLines(prepared, textBlockWidth, lineHeight);
  const blockHeight = result.lineCount * lineHeight;
  const startX = (viewportWidth - textBlockWidth) / 2;
  const startY = Math.max(textPadding, (viewportHeight - blockHeight) / 2);
  const particles: ForceFieldParticle[] = [];

  for (let lineIndex = 0; lineIndex < result.lines.length; lineIndex += 1) {
    const line = result.lines[lineIndex]!;
    const lineY = startY + lineIndex * lineHeight;
    let cursorX = startX;

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
}: RenderForceFieldOptions): void {
  ctx.clearRect(0, 0, viewportWidth, viewportHeight);

  drawGlassSurface(ctx, viewportWidth, viewportHeight, time);

  if (pointer.active) {
    const glow = ctx.createRadialGradient(
      pointer.x,
      pointer.y,
      0,
      pointer.x,
      pointer.y,
      pointerRadius,
    );
    glow.addColorStop(0, 'rgba(125, 170, 255, 0.11)');
    glow.addColorStop(0.55, 'rgba(125, 170, 255, 0.04)');
    glow.addColorStop(1, 'rgba(125, 170, 255, 0)');

    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, pointerRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

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
}
