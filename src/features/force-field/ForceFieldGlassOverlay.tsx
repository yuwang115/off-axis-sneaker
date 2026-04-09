import React, { useEffect, useRef } from 'react';
import { prepareWithSegments, type PreparedTextWithSegments } from '@chenglou/pretext';

import {
  FORCE_FIELD_FONT,
  FORCE_FIELD_LINE_HEIGHT,
  FORCE_FIELD_MAX_TEXT_WIDTH,
  FORCE_FIELD_PHYSICS,
  FORCE_FIELD_TEXT_PADDING,
} from './constants';
import {
  buildForceFieldParticles,
  getMaxParticleDisplacement,
  renderForceField,
  simulateParticles,
  type ForceFieldParticle,
  type ForceFieldPointer,
} from './engine';

interface ForceFieldGlassOverlayProps {
  text: string;
  enabled?: boolean;
  className?: string;
}

type OverlayRuntime = {
  frameId: number | null;
  lastTime: number | null;
  prepared: PreparedTextWithSegments | null;
  particles: ForceFieldParticle[];
  pointer: ForceFieldPointer;
  viewportWidth: number;
  viewportHeight: number;
};

function getFontsReadyPromise(): Promise<unknown> {
  const fonts = document.fonts as FontFaceSet | undefined;
  return fonts?.ready ?? Promise.resolve();
}

function resetOverlayDataset(element: HTMLDivElement): void {
  element.dataset.forceFieldReady = 'false';
  element.dataset.forceFieldPointerActive = 'false';
  element.dataset.forceFieldParticleCount = '0';
  element.dataset.forceFieldDisplacement = '0';
}

const ForceFieldGlassOverlay: React.FC<ForceFieldGlassOverlayProps> = ({
  text,
  enabled = true,
  className,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<OverlayRuntime>({
    frameId: null,
    lastTime: null,
    prepared: null,
    particles: [],
    pointer: { x: -9999, y: -9999, active: false },
    viewportWidth: 0,
    viewportHeight: 0,
  });

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;

    if (!enabled || !root || !canvas) {
      if (root) {
        resetOverlayDataset(root);
      }
      return undefined;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      resetOverlayDataset(root);
      return undefined;
    }

    let disposed = false;
    const runtime = runtimeRef.current;
    runtime.prepared = null;
    runtime.particles = [];
    runtime.pointer = { x: -9999, y: -9999, active: false };
    runtime.lastTime = null;
    resetOverlayDataset(root);

    const syncDataset = (): void => {
      root.dataset.forceFieldReady = String(runtime.particles.length > 0);
      root.dataset.forceFieldPointerActive = String(runtime.pointer.active);
      root.dataset.forceFieldParticleCount = String(runtime.particles.length);
      root.dataset.forceFieldDisplacement = getMaxParticleDisplacement(
        runtime.particles,
      ).toFixed(2);
    };

    const resizeCanvas = (width: number, height: number): void => {
      const pixelRatio = window.devicePixelRatio || 1;
      runtime.viewportWidth = width;
      runtime.viewportHeight = height;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.font = FORCE_FIELD_FONT;
    };

    const rebuildParticles = (): void => {
      if (!runtime.prepared) {
        return;
      }

      const bounds = root.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      resizeCanvas(width, height);

      runtime.particles = buildForceFieldParticles({
        prepared: runtime.prepared,
        viewportWidth: width,
        viewportHeight: height,
        lineHeight: FORCE_FIELD_LINE_HEIGHT,
        textPadding: FORCE_FIELD_TEXT_PADDING,
        maxTextWidth: FORCE_FIELD_MAX_TEXT_WIDTH,
        measureText: (value) => context.measureText(value).width,
      });
      runtime.lastTime = null;
      syncDataset();
    };

    const setPointer = (pointer: ForceFieldPointer): void => {
      runtime.pointer = pointer;
      root.dataset.forceFieldPointerActive = String(pointer.active);
    };

    const handlePointerMove = (event: PointerEvent): void => {
      const bounds = root.getBoundingClientRect();
      const withinX = event.clientX >= bounds.left && event.clientX <= bounds.right;
      const withinY = event.clientY >= bounds.top && event.clientY <= bounds.bottom;

      if (withinX && withinY) {
        setPointer({
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
          active: true,
        });
        return;
      }

      setPointer({ x: -9999, y: -9999, active: false });
    };

    const deactivatePointer = (): void => {
      setPointer({ x: -9999, y: -9999, active: false });
    };

    const handleVisibilityChange = (): void => {
      if (document.hidden) {
        deactivatePointer();
      }
    };

    const frame = (now: number): void => {
      if (disposed) {
        return;
      }

      const dt =
        runtime.lastTime === null
          ? 0.016
          : Math.min((now - runtime.lastTime) / 1000, FORCE_FIELD_PHYSICS.dtCap);
      runtime.lastTime = now;

      simulateParticles(runtime.particles, runtime.pointer, dt, FORCE_FIELD_PHYSICS);
      renderForceField({
        ctx: context,
        particles: runtime.particles,
        pointer: runtime.pointer,
        viewportWidth: runtime.viewportWidth,
        viewportHeight: runtime.viewportHeight,
        pointerRadius: FORCE_FIELD_PHYSICS.forceRadius,
        time: now / 1000,
      });
      syncDataset();

      runtime.frameId = window.requestAnimationFrame(frame);
    };

    const resizeObserver = new ResizeObserver(() => {
      rebuildParticles();
    });
    resizeObserver.observe(root);

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('blur', deactivatePointer);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    void getFontsReadyPromise().then(() => {
      if (disposed) {
        return;
      }

      runtime.prepared = prepareWithSegments(text, FORCE_FIELD_FONT);
      rebuildParticles();

      if (runtime.frameId === null) {
        runtime.frameId = window.requestAnimationFrame(frame);
      }
    });

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('blur', deactivatePointer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (runtime.frameId !== null) {
        window.cancelAnimationFrame(runtime.frameId);
        runtime.frameId = null;
      }

      resetOverlayDataset(root);
    };
  }, [enabled, text]);

  if (!enabled) {
    return null;
  }

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      data-testid="force-field-overlay"
      className={['absolute inset-0 pointer-events-none overflow-hidden', className]
        .filter(Boolean)
        .join(' ')}
    >
      <canvas
        ref={canvasRef}
        data-testid="force-field-overlay-canvas"
        className="h-full w-full"
      />
    </div>
  );
};

export default ForceFieldGlassOverlay;
