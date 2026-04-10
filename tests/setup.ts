import '@testing-library/jest-dom/vitest';

import { vi } from 'vitest';

type MockCanvasContext = {
  canvas: HTMLCanvasElement;
  font: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  lineWidth: number;
  globalAlpha: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  letterSpacing: string;
  save: () => void;
  restore: () => void;
  clearRect: (...args: number[]) => void;
  fillRect: (...args: number[]) => void;
  strokeRect: (...args: number[]) => void;
  beginPath: () => void;
  closePath: () => void;
  moveTo: (...args: number[]) => void;
  lineTo: (...args: number[]) => void;
  stroke: () => void;
  fill: () => void;
  arc: (...args: number[]) => void;
  setTransform: (...args: number[]) => void;
  translate: (...args: number[]) => void;
  rotate: (angle: number) => void;
  scale: (...args: number[]) => void;
  clip: () => void;
  fillText: (text: string, x: number, y: number) => void;
  measureText: (text: string) => TextMetrics;
  createLinearGradient: (...args: number[]) => CanvasGradient;
  createRadialGradient: (...args: number[]) => CanvasGradient;
};

const originalDevicePixelRatio = window.devicePixelRatio;

function createGradient(): CanvasGradient {
  return {
    addColorStop: vi.fn(),
  } as unknown as CanvasGradient;
}

function createMockContext(canvas: HTMLCanvasElement): MockCanvasContext {
  return {
    canvas,
    font: '16px sans-serif',
    fillStyle: '#000',
    strokeStyle: '#000',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineWidth: 1,
    globalAlpha: 1,
    shadowColor: 'rgba(0, 0, 0, 0)',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    letterSpacing: '0px',
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    clip: vi.fn(),
    fillText: vi.fn(),
    measureText: (text: string) =>
      ({
        width: text.split('').reduce((total, character) => {
          if (character === ' ') {
            return total + 7;
          }
          if (/[\u4e00-\u9fff]/u.test(character)) {
            return total + 18;
          }
          return total + 11;
        }, 0),
      }) as TextMetrics,
    createLinearGradient: () => createGradient(),
    createRadialGradient: () => createGradient(),
  };
}

Object.defineProperty(window, 'devicePixelRatio', {
  configurable: true,
  value: 2,
});

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: {
    ready: Promise.resolve(),
    load: () => Promise.resolve([]),
  },
});

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: function getContext(type: string) {
    if (type !== '2d') {
      return null;
    }

    const canvas = this as HTMLCanvasElement & {
      __mockContext?: MockCanvasContext;
    };

    if (!canvas.__mockContext) {
      canvas.__mockContext = createMockContext(canvas);
    }

    return canvas.__mockContext;
  },
});

Object.defineProperty(HTMLCanvasElement.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: function getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 800,
      right: 1200,
      width: 1200,
      height: 800,
      toJSON() {
        return {};
      },
    };
  },
});

Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: function getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 800,
      right: 1200,
      width: 1200,
      height: 800,
      toJSON() {
        return {};
      },
    };
  },
});

class MockResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    this.callback(
      [
        {
          borderBoxSize: [],
          contentBoxSize: [],
          contentRect: target.getBoundingClientRect(),
          devicePixelContentBoxSize: [],
          target,
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }

  disconnect(): void {}

  unobserve(): void {}
}

Object.defineProperty(window, 'ResizeObserver', {
  configurable: true,
  value: MockResizeObserver,
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    value: originalDevicePixelRatio,
  });
});
