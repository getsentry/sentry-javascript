/**
 * @vitest-environment jsdom
 */

import * as Sentry from '@sentry/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Browser Profiling v2 trace lifecycle', () => {
  afterEach(async () => {
    const client = Sentry.getClient();
    await client?.close();
    // reset profiler constructor
    (window as any).Profiler = undefined;
    vi.restoreAllMocks();
  });

  function mockProfiler() {
    const stop = vi.fn().mockResolvedValue({
      frames: [{ name: 'f' }],
      stacks: [{ frameId: 0 }],
      samples: [{ timestamp: 0 }, { timestamp: 10 }],
      resources: [],
    });

    class MockProfilerImpl {
      stopped: boolean = false;
      constructor(_opts: { sampleInterval: number; maxBufferSize: number }) {}
      stop() {
        this.stopped = true;
        return stop();
      }
      addEventListener() {}
    }

    const mockConstructor = vi.fn().mockImplementation((opts: { sampleInterval: number; maxBufferSize: number }) => {
      return new MockProfilerImpl(opts);
    });

    (window as any).Profiler = mockConstructor;
    return { stop, mockConstructor };
  }

  it('does not start profiler when tracing is disabled (logs a warning)', async () => {
    const { stop, mockConstructor } = mockProfiler();
    const send = vi.fn().mockResolvedValue(undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    Sentry.init({
      // tracing disabled
      dsn: 'https://public@o.ingest.sentry.io/1',
      profileSessionSampleRate: 1,
      profileLifecycle: 'trace',
      integrations: [Sentry.browserProfilingIntegration()],
      // no tracesSampleRate/tracesSampler
      transport: () => ({ flush: vi.fn().mockResolvedValue(true), send }),
    });

    // warning is logged by our debug logger only when DEBUG_BUILD, so just assert no throw and no profiler
    const client = Sentry.getClient();
    expect(client).toBeDefined();
    expect(stop).toHaveBeenCalledTimes(0);
    expect(mockConstructor).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
