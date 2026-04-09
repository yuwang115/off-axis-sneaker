import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ForceFieldGlassOverlay from './ForceFieldGlassOverlay';
import { FORCE_FIELD_COPY } from './copy';

describe('ForceFieldGlassOverlay', () => {
  it('creates a high-DPI canvas and cancels its animation frame on unmount', async () => {
    const cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame');

    const { unmount } = render(
      <div className="relative h-[600px] w-[800px]">
        <ForceFieldGlassOverlay text={FORCE_FIELD_COPY} />
      </div>,
    );

    const overlay = await screen.findByTestId('force-field-overlay');
    const canvas = await screen.findByTestId('force-field-overlay-canvas');

    await waitFor(() => {
      expect(overlay).toHaveAttribute('data-force-field-ready', 'true');
    });

    expect(canvas).toHaveAttribute('width', '1600');
    expect(canvas).toHaveAttribute('height', '1200');

    unmount();

    expect(cancelAnimationFrameSpy).toHaveBeenCalled();
  });

  it('keeps underlying controls clickable while the overlay is active', async () => {
    const onClick = vi.fn();

    render(
      <div className="relative h-[600px] w-[800px]">
        <button onClick={onClick}>Open controls</button>
        <ForceFieldGlassOverlay text={FORCE_FIELD_COPY} />
      </div>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('force-field-overlay')).toHaveAttribute(
        'data-force-field-ready',
        'true',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open controls' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('updates its pointer dataset from global pointer and visibility events', async () => {
    render(
      <div className="relative h-[600px] w-[800px]">
        <ForceFieldGlassOverlay text={FORCE_FIELD_COPY} />
      </div>,
    );

    const overlay = await screen.findByTestId('force-field-overlay');

    await waitFor(() => {
      expect(overlay).toHaveAttribute('data-force-field-ready', 'true');
    });

    fireEvent.pointerMove(window, { clientX: 120, clientY: 140 });
    expect(overlay).toHaveAttribute('data-force-field-pointer-active', 'true');

    fireEvent.blur(window);
    expect(overlay).toHaveAttribute('data-force-field-pointer-active', 'false');
  });

  it('returns null when disabled', () => {
    render(
      <div className="relative h-[600px] w-[800px]">
        <ForceFieldGlassOverlay enabled={false} text={FORCE_FIELD_COPY} />
      </div>,
    );

    expect(screen.queryByTestId('force-field-overlay')).toBeNull();
  });
});
