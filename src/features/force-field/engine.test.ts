import { prepareWithSegments } from '@chenglou/pretext';
import { describe, expect, it } from 'vitest';

import {
  buildForceFieldParticles,
  getMaxParticleDisplacement,
  renderForceField,
  simulateParticles,
  type ForceFieldParticle,
} from './engine';
import {
  FORCE_FIELD_FONT,
  FORCE_FIELD_LINE_HEIGHT,
  FORCE_FIELD_MAX_TEXT_WIDTH,
  FORCE_FIELD_PHYSICS,
  FORCE_FIELD_TEXT_PADDING,
} from './constants';
import { FORCE_FIELD_COPY } from './copy';

function cloneParticles(particles: ForceFieldParticle[]): ForceFieldParticle[] {
  return particles.map((particle) => ({ ...particle }));
}

describe('force-field engine', () => {
  it('builds stable particles inside a centered reading area', () => {
    const prepared = prepareWithSegments(FORCE_FIELD_COPY, FORCE_FIELD_FONT);
    const viewportWidth = 1200;
    const viewportHeight = 800;

    const particles = buildForceFieldParticles({
      prepared,
      viewportWidth,
      viewportHeight,
      lineHeight: FORCE_FIELD_LINE_HEIGHT,
      textPadding: FORCE_FIELD_TEXT_PADDING,
      maxTextWidth: FORCE_FIELD_MAX_TEXT_WIDTH,
      measureText: (text) => text.length * 12,
    });

    expect(particles.length).toBeGreaterThan(20);

    const minX = Math.min(...particles.map((particle) => particle.homeX));
    const maxX = Math.max(...particles.map((particle) => particle.homeX));
    const minY = Math.min(...particles.map((particle) => particle.homeY));
    const maxAllowedWidth = Math.min(
      viewportWidth - FORCE_FIELD_TEXT_PADDING * 2,
      FORCE_FIELD_MAX_TEXT_WIDTH,
    );
    const expectedStartX = (viewportWidth - maxAllowedWidth) / 2;

    expect(minX).toBeGreaterThanOrEqual(expectedStartX);
    expect(maxX).toBeLessThanOrEqual(expectedStartX + maxAllowedWidth);
    expect(minY).toBeGreaterThanOrEqual(FORCE_FIELD_TEXT_PADDING);
  });

  it('repels particles near the pointer and lets them settle back home', () => {
    const particles: ForceFieldParticle[] = [
      {
        char: '屏',
        homeX: 200,
        homeY: 180,
        x: 200,
        y: 180,
        vx: 0,
        vy: 0,
      },
    ];

    simulateParticles(
      particles,
      { x: 205, y: 185, active: true },
      0.016,
      FORCE_FIELD_PHYSICS,
    );

    expect(particles[0]?.x).not.toBe(200);
    expect(particles[0]?.y).not.toBe(180);

    for (let index = 0; index < 120; index += 1) {
      simulateParticles(
        particles,
        { x: 0, y: 0, active: false },
        0.016,
        FORCE_FIELD_PHYSICS,
      );
    }

    expect(particles[0]?.x).toBeCloseTo(200, 1);
    expect(particles[0]?.y).toBeCloseTo(180, 1);
  });

  it('caps particle velocity even under strong force spikes', () => {
    const particles: ForceFieldParticle[] = [
      {
        char: '面',
        homeX: 150,
        homeY: 150,
        x: 152,
        y: 152,
        vx: 0,
        vy: 0,
      },
    ];

    const exaggeratedPhysics = {
      ...FORCE_FIELD_PHYSICS,
      forceStrength: FORCE_FIELD_PHYSICS.forceStrength * 20,
    };

    simulateParticles(
      particles,
      { x: 151, y: 151, active: true },
      0.05,
      exaggeratedPhysics,
    );

    const speed = Math.hypot(particles[0]!.vx, particles[0]!.vy);
    expect(speed).toBeLessThanOrEqual(FORCE_FIELD_PHYSICS.maxVelocity);
  });

  it('does not drift when the pointer is inactive and particles are already home', () => {
    const prepared = prepareWithSegments('静止文字', FORCE_FIELD_FONT);
    const particles = buildForceFieldParticles({
      prepared,
      viewportWidth: 900,
      viewportHeight: 600,
      lineHeight: FORCE_FIELD_LINE_HEIGHT,
      textPadding: FORCE_FIELD_TEXT_PADDING,
      maxTextWidth: FORCE_FIELD_MAX_TEXT_WIDTH,
      measureText: (text) => text.length * 14,
    });
    const original = cloneParticles(particles);

    simulateParticles(
      particles,
      { x: 0, y: 0, active: false },
      0.016,
      FORCE_FIELD_PHYSICS,
    );

    expect(particles).toEqual(original);
  });

  it('returns no particles when the viewport cannot fit the text block', () => {
    const prepared = prepareWithSegments('太窄', FORCE_FIELD_FONT);
    const particles = buildForceFieldParticles({
      prepared,
      viewportWidth: 100,
      viewportHeight: 600,
      lineHeight: FORCE_FIELD_LINE_HEIGHT,
      textPadding: 72,
      maxTextWidth: FORCE_FIELD_MAX_TEXT_WIDTH,
      measureText: (text) => text.length * 12,
    });

    expect(particles).toEqual([]);
  });

  it('ignores non-positive time deltas', () => {
    const particles: ForceFieldParticle[] = [
      {
        char: '静',
        homeX: 100,
        homeY: 120,
        x: 100,
        y: 120,
        vx: 10,
        vy: -5,
      },
    ];

    simulateParticles(
      particles,
      { x: 100, y: 120, active: true },
      0,
      FORCE_FIELD_PHYSICS,
    );

    expect(particles[0]).toEqual({
      char: '静',
      homeX: 100,
      homeY: 120,
      x: 100,
      y: 120,
      vx: 10,
      vy: -5,
    });
  });

  it('renders glass highlights and active pointer glow', () => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;

    const particles: ForceFieldParticle[] = [
      {
        char: '玻',
        homeX: 180,
        homeY: 200,
        x: 186,
        y: 204,
        vx: 0,
        vy: 0,
      },
    ];

    renderForceField({
      ctx: context,
      particles,
      pointer: { x: 160, y: 190, active: true },
      viewportWidth: 800,
      viewportHeight: 600,
      pointerRadius: FORCE_FIELD_PHYSICS.forceRadius,
      time: 1.2,
    });

    expect(context.clearRect).toHaveBeenCalled();
    expect(context.strokeRect).toHaveBeenCalled();
    expect(context.arc).toHaveBeenCalledWith(
      160,
      190,
      FORCE_FIELD_PHYSICS.forceRadius,
      0,
      Math.PI * 2,
    );
    expect(context.fillText).toHaveBeenCalledWith('玻', 186, 204);
    expect(getMaxParticleDisplacement(particles)).toBeGreaterThan(0);
  });
});
