import { vi } from 'vitest';

// jsdom doesn't implement these; several UI primitives touch them.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const g = globalThis as unknown as Record<string, unknown>;
if (!g.ResizeObserver) {
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const proto = Element.prototype as unknown as Record<string, unknown>;
// jsdom lacks the Web Animations API that spinners/animations call.
if (!proto.scrollIntoView) proto.scrollIntoView = () => {};
if (!proto.getAnimations) proto.getAnimations = () => [];
if (!proto.animate) {
  proto.animate = () => ({
    cancel() {},
    finish() {},
    play() {},
    pause() {},
    reverse() {},
    finished: Promise.resolve(),
    onfinish: null,
    oncancel: null,
  });
}
