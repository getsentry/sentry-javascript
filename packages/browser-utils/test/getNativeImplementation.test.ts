/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCachedImplementation, setTimeout as sentrySetTimeout } from '../src/getNativeImplementation';
import { WINDOW } from '../src/types';

describe('setTimeout', () => {
  const originalSetTimeout = WINDOW.setTimeout;

  beforeEach(() => {
    clearCachedImplementation('setTimeout');
  });

  afterEach(() => {
    WINDOW.setTimeout = originalSetTimeout;
    clearCachedImplementation('setTimeout');
    vi.restoreAllMocks();
  });

  it('falls back to window.setTimeout if the sandboxed iframe implementation throws', async () => {
    // Simulate a wrapped (non-native) window.setTimeout, e.g. by a browser extension
    const wrappedSetTimeout = vi.fn((...args: Parameters<typeof originalSetTimeout>) => originalSetTimeout(...args));
    WINDOW.setTimeout = wrappedSetTimeout as unknown as typeof WINDOW.setTimeout;

    // Simulate Firefox throwing `NS_ERROR_NOT_INITIALIZED` when calling setTimeout of a detached iframe window
    const detachedSetTimeout = vi.fn(() => {
      const error = new Error('');
      error.name = 'NS_ERROR_NOT_INITIALIZED';
      throw error;
    });
    const fakeIframe = { hidden: false, contentWindow: { setTimeout: detachedSetTimeout } };

    const document = WINDOW.document as Document;
    vi.spyOn(document, 'createElement').mockReturnValue(fakeIframe as unknown as HTMLElement);
    vi.spyOn(document.head, 'appendChild').mockImplementation(node => node);
    vi.spyOn(document.head, 'removeChild').mockImplementation(node => node);

    const callback = vi.fn();

    expect(() => sentrySetTimeout(callback, 0)).not.toThrow();
    expect(detachedSetTimeout).toHaveBeenCalledTimes(1);
    expect(wrappedSetTimeout).toHaveBeenCalledTimes(1);

    // Subsequent calls use the cached fallback and do not hit the broken implementation again
    sentrySetTimeout(callback, 0);
    expect(detachedSetTimeout).toHaveBeenCalledTimes(1);
    expect(wrappedSetTimeout).toHaveBeenCalledTimes(2);

    await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(2));
  });
});
