import { prepareWithSegments } from '@chenglou/pretext';
import { describe, expect, it } from 'vitest';

import {
  buildTwoColumnForceFieldParticles,
  computeTwoColumnGeometry,
  getMaxParticleDisplacement,
  renderForceField,
  simulateParticles,
  type ForceFieldParticle,
} from './engine';
import {
  FORCE_FIELD_COLUMN_GUTTER,
  FORCE_FIELD_COLUMN_WIDTH,
  FORCE_FIELD_FONT,
  FORCE_FIELD_LINE_HEIGHT,
  FORCE_FIELD_PHYSICS,
  FORCE_FIELD_TEXT_PADDING,
} from './constants';
import {
  FORCE_FIELD_COPY_LEFT,
  FORCE_FIELD_COPY_LEFT_LABEL,
  FORCE_FIELD_COPY_RIGHT,
  FORCE_FIELD_COPY_RIGHT_LABEL,
} from './copy';

function cloneParticles(particles: ForceFieldParticle[]): ForceFieldParticle[] {
  return particles.map((particle) => ({ ...particle }));
}

const LEFT_PREPARED = prepareWithSegments(FORCE_FIELD_COPY_LEFT, FORCE_FIELD_FONT);
const RIGHT_PREPARED = prepareWithSegments(FORCE_FIELD_COPY_RIGHT, FORCE_FIELD_FONT);

const ASCII_MEASURE = (text: string): number =>
  text.split('').reduce((total, character) => {
    if (character === ' ') return total + 7;
    return total + 11;
  }, 0);

describe('computeTwoColumnGeometry', () => {
  it('centers the full two-column block horizontally in the viewport', () => {
    const geometry = computeTwoColumnGeometry({
      leftPrepared: LEFT_PREPARED,
      rightPrepared: RIGHT_PREPARED,
      viewportWidth: 1400,
      viewportHeight: 900,
      lineHeight: FORCE_FIELD_LINE_HEIGHT,
      textPadding: FORCE_FIELD_TEXT_PADDING,
      columnWidth: FORCE_FIELD_COLUMN_WIDTH,
      columnGutter: FORCE_FIELD_COLUMN_GUTTER,
    });

    expect(geometry).not.toBeNull();
    if (!geometry) return;

    expect(geometry.totalWidth).toBe(
      FORCE_FIELD_COLUMN_WIDTH * 2 + FORCE_FIELD_COLUMN_GUTTER,
    );
    expect(geometry.right.startX).toBe(
      geometry.left.startX + FORCE_FIELD_COLUMN_WIDTH + FORCE_FIELD_COLUMN_GUTTER,
    );
    // Block is centered (allow 1px rounding).
    const blockCenterX = geometry.left.startX + geometry.totalWidth / 2;
    expect(Math.abs(blockCenterX - 1400 / 2)).toBeLessThanOrEqual(1);
  });

  it('anchors both columns against the same top line (the taller column drives height)', () => {
    const shortPrepared = prepareWithSegments('one two three', FORCE_FIELD_FONT);
    const longPrepared = prepareWithSegments(
      'This is a much longer paragraph that wraps across many more lines ' +
        'than the short column because it contains a lot more words in total.',
      FORCE_FIELD_FONT,
    );

    const geometry = computeTwoColumnGeometry({
      leftPrepared: shortPrepared,
      rightPrepared: longPrepared,
      viewportWidth: 1400,
      viewportHeight: 900,
      lineHeight: FORCE_FIELD_LINE_HEIGHT,
      textPadding: FORCE_FIELD_TEXT_PADDING,
      columnWidth: FORCE_FIELD_COLUMN_WIDTH,
      columnGutter: FORCE_FIELD_COLUMN_GUTTER,
    });

    expect(geometry).not.toBeNull();
    if (!geometry) return;

    expect(geometry.left.startY).toBe(geometry.right.startY);
    expect(geometry.right.lineCount).toBeGreaterThan(geometry.left.lineCount);
    expect(geometry.blockHeight).toBe(geometry.right.lineCount * FORCE_FIELD_LINE_HEIGHT);
  });

  it('returns null when the two columns cannot fit the viewport width', () => {
    const geometry = computeTwoColumnGeometry({
      leftPrepared: LEFT_PREPARED,
      rightPrepared: RIGHT_PREPARED,
      viewportWidth: 700, // too narrow
      viewportHeight: 900,
      lineHeight: FORCE_FIELD_LINE_HEIGHT,
      textPadding: FORCE_FIELD_TEXT_PADDING,
      columnWidth: FORCE_FIELD_COLUMN_WIDTH,
      columnGutter: FORCE_FIELD_COLUMN_GUTTER,
    });

    expect(geometry).toBeNull();
  });
});

describe('buildTwoColumnForceFieldParticles', () => {
  it('produces particles for both columns with a clean horizontal separation', () => {
    const { particles, geometry } = buildTwoColumnForceFieldParticles({
      leftPrepared: LEFT_PREPARED,
      rightPrepared: RIGHT_PREPARED,
      viewportWidth: 1400,
      viewportHeight: 900,
      lineHeight: FORCE_FIELD_LINE_HEIGHT,
      textPadding: FORCE_FIELD_TEXT_PADDING,
      columnWidth: FORCE_FIELD_COLUMN_WIDTH,
      columnGutter: FORCE_FIELD_COLUMN_GUTTER,
      measureText: ASCII_MEASURE,
    });

    expect(particles.length).toBeGreaterThan(40);
    expect(geometry).not.toBeNull();
    if (!geometry) return;

    const leftColumnRight = geometry.left.startX + FORCE_FIELD_COLUMN_WIDTH;
    const rightColumnLeft = geometry.right.startX;

    const leftParticles = particles.filter(
      (particle) => particle.homeX < leftColumnRight,
    );
    const rightParticles = particles.filter(
      (particle) => particle.homeX > rightColumnLeft,
    );

    expect(leftParticles.length).toBeGreaterThan(10);
    expect(rightParticles.length).toBeGreaterThan(10);
    // Gutter is fully empty — no particle lives between the two columns.
    expect(leftParticles.length + rightParticles.length).toBe(particles.length);

    // Min right-column X is strictly greater than max left-column X.
    const leftMaxX = Math.max(...leftParticles.map((p) => p.homeX));
    const rightMinX = Math.min(...rightParticles.map((p) => p.homeX));
    expect(rightMinX).toBeGreaterThan(leftMaxX);
  });

  it('returns empty particles and null geometry when the viewport cannot fit', () => {
    const result = buildTwoColumnForceFieldParticles({
      leftPrepared: LEFT_PREPARED,
      rightPrepared: RIGHT_PREPARED,
      viewportWidth: 600,
      viewportHeight: 800,
      lineHeight: FORCE_FIELD_LINE_HEIGHT,
      textPadding: FORCE_FIELD_TEXT_PADDING,
      columnWidth: FORCE_FIELD_COLUMN_WIDTH,
      columnGutter: FORCE_FIELD_COLUMN_GUTTER,
      measureText: ASCII_MEASURE,
    });

    expect(result.particles).toEqual([]);
    expect(result.geometry).toBeNull();
  });
});

describe('simulateParticles', () => {
  it('repels particles near the pointer and lets them settle back home', () => {
    const particles: ForceFieldParticle[] = [
      {
        char: 'a',
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
        char: 'b',
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
    const { particles } = buildTwoColumnForceFieldParticles({
      leftPrepared: prepareWithSegments('alpha bravo charlie delta', FORCE_FIELD_FONT),
      rightPrepared: prepareWithSegments('echo foxtrot golf hotel', FORCE_FIELD_FONT),
      viewportWidth: 1400,
      viewportHeight: 900,
      lineHeight: FORCE_FIELD_LINE_HEIGHT,
      textPadding: FORCE_FIELD_TEXT_PADDING,
      columnWidth: FORCE_FIELD_COLUMN_WIDTH,
      columnGutter: FORCE_FIELD_COLUMN_GUTTER,
      measureText: ASCII_MEASURE,
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

  it('ignores non-positive time deltas', () => {
    const particles: ForceFieldParticle[] = [
      {
        char: 'c',
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
      char: 'c',
      homeX: 100,
      homeY: 120,
      x: 100,
      y: 120,
      vx: 10,
      vy: -5,
    });
  });
});

describe('renderForceField', () => {
  it('renders dark glass highlights, pointer glow, and shadowed text', () => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;

    const particles: ForceFieldParticle[] = [
      {
        char: 'a',
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
      viewportWidth: 1200,
      viewportHeight: 800,
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
    expect(context.fillText).toHaveBeenCalledWith('a', 186, 204);
    // Shadow block is wrapped in save/restore so state cannot leak frames.
    expect(context.save).toHaveBeenCalled();
    expect(context.restore).toHaveBeenCalled();
    expect(getMaxParticleDisplacement(particles)).toBeGreaterThan(0);
  });

  it('draws column labels above each column when geometry and labels are provided', () => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;

    const { particles, geometry } = buildTwoColumnForceFieldParticles({
      leftPrepared: LEFT_PREPARED,
      rightPrepared: RIGHT_PREPARED,
      viewportWidth: 1400,
      viewportHeight: 900,
      lineHeight: FORCE_FIELD_LINE_HEIGHT,
      textPadding: FORCE_FIELD_TEXT_PADDING,
      columnWidth: FORCE_FIELD_COLUMN_WIDTH,
      columnGutter: FORCE_FIELD_COLUMN_GUTTER,
      measureText: ASCII_MEASURE,
    });

    expect(geometry).not.toBeNull();
    if (!geometry) return;

    renderForceField({
      ctx: context,
      particles,
      pointer: { x: -9999, y: -9999, active: false },
      viewportWidth: 1400,
      viewportHeight: 900,
      pointerRadius: FORCE_FIELD_PHYSICS.forceRadius,
      time: 0,
      geometry,
      labels: {
        left: FORCE_FIELD_COPY_LEFT_LABEL,
        right: FORCE_FIELD_COPY_RIGHT_LABEL,
      },
    });

    expect(context.fillText).toHaveBeenCalledWith(
      FORCE_FIELD_COPY_LEFT_LABEL.toUpperCase(),
      geometry.left.startX,
      expect.any(Number),
    );
    expect(context.fillText).toHaveBeenCalledWith(
      FORCE_FIELD_COPY_RIGHT_LABEL.toUpperCase(),
      geometry.right.startX,
      expect.any(Number),
    );
  });
});
