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
if (!window.ResizeObserver) {
  // @ts-expect-error minimal stub
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

// jsdom lacks the Web Animations API that spinners/animations call.
if (!Element.prototype.getAnimations) {
  // @ts-expect-error minimal stub
  Element.prototype.getAnimations = () => [];
}
if (!Element.prototype.animate) {
  // @ts-expect-error minimal stub
  Element.prototype.animate = () => ({
    cancel() {}, finish() {}, play() {}, pause() {}, reverse() {},
    finished: Promise.resolve(), onfinish: null, oncancel: null,
  });
}
