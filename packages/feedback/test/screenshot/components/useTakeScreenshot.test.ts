/**
 * @vitest-environment jsdom
 */
import { h, render } from 'preact';
import * as hooks from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTakeScreenshotFactory } from '../../../src/screenshot/components/useTakeScreenshot';

describe('useTakeScreenshot', () => {
  const getDisplayMedia = vi.fn();
  const onBeforeScreenshot = vi.fn();
  const onError = vi.fn();
  let pendingFrames: FrameRequestCallback[] = [];

  /** Runs the callbacks queued so far, like the browser does at the start of one frame. */
  async function drawFrame(): Promise<void> {
    pendingFrames.splice(0).forEach(callback => callback(0));
    await vi.advanceTimersByTimeAsync(0);
  }

  function mountHook(): void {
    const useTakeScreenshot = useTakeScreenshotFactory({ hooks });
    const Probe = (): null => {
      useTakeScreenshot({ onBeforeScreenshot, onScreenshot: vi.fn(), onAfterScreenshot: vi.fn(), onError });
      return null;
    };
    act(() => {
      render(h(Probe, null), document.body);
    });
  }

  beforeEach(() => {
    pendingFrames = [];
    getDisplayMedia.mockRejectedValue(new Error('NotAllowedError'));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => pendingFrames.push(callback));
    vi.stubGlobal('matchMedia', () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    Object.defineProperty(navigator, 'mediaDevices', { value: { getDisplayMedia }, configurable: true });
  });

  afterEach(() => {
    render(null, document.body);
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('requests the capture only after the page has drawn two frames without the form', async () => {
    mountHook();

    expect(onBeforeScreenshot).toHaveBeenCalledTimes(1);
    expect(getDisplayMedia).not.toHaveBeenCalled();

    await drawFrame();
    expect(getDisplayMedia).not.toHaveBeenCalled();

    await drawFrame();
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
  });

  it('requests the capture after 300ms when the page draws no frames', async () => {
    mountHook();

    await vi.advanceTimersByTimeAsync(299);
    expect(getDisplayMedia).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
  });
});
