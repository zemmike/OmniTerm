/**
 * Browser APIs jsdom does not implement.
 *
 * jsdom gives us DOM + localStorage, but not `matchMedia`, `ResizeObserver` or
 * `navigator.clipboard`. Vitest's jsdom environment exposes the global object
 * from jsdom, so anything the components touch at render time has to exist
 * before they render. This module is imported (and `installBrowserApiStubs()`
 * called) at the top of tests/a11y.test.ts — no vitest.config.ts change and no
 * new setup file registered in config.
 */
import { vi } from 'vitest';

let installed = false;

export function installBrowserApiStubs(): void {
  if (installed) return;
  installed = true;
  if (typeof window === 'undefined') return;

  // ---- matchMedia (CSS media queries; jsdom has none) ---------------------
  const win = window as Window & { matchMedia?: (q: string) => MediaQueryList };
  if (typeof win.matchMedia !== 'function') {
    const matchMedia = (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
    Object.defineProperty(win, 'matchMedia', {
      configurable: true,
      writable: true,
      value: matchMedia,
    });
  }

  // ---- ResizeObserver (xterm's fit addon / the split-pane root use it) -----
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver !== 'function') {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverStub,
    });
    Object.defineProperty(win, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverStub,
    });
  }

  // ---- clipboard (copyOnSelect / middle-click paste) ----------------------
  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async () => undefined),
        readText: vi.fn(async () => ''),
        write: vi.fn(async () => undefined),
        read: vi.fn(async () => []),
      },
    });
  }
}
