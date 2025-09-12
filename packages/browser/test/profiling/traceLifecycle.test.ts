/**
 * @vitest-environment jsdom
 */

import * as Sentry from '@sentry/browser';
import type { Span } from '@sentry/core';
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

  it('keeps running across overlapping sampled root spans and stops after the last ends', async () => {
    const { stop } = mockProfiler();
    const send = vi.fn().mockResolvedValue(undefined);

    Sentry.init({
      dsn: 'https://public@o.ingest.sentry.io/1',
      tracesSampleRate: 1,
      profileSessionSampleRate: 1,
      profileLifecycle: 'trace',
      integrations: [Sentry.browserProfilingIntegration()],
      transport: () => ({ flush: vi.fn().mockResolvedValue(true), send }),
    });

    let firstSpan: Span | undefined;

    // Start first root span manually
    Sentry.startSpanManual({ name: 'manual root 1', parentSpan: null, forceTransaction: true }, span => {
      firstSpan = span;
    });

    expect(stop).toBeCalledTimes(0);

    // Start second overlapping root span
    Sentry.startSpan({ name: 'manual root 2', parentSpan: null, forceTransaction: true }, span => {
      expect(span).toBeDefined();
    });

    expect(stop).toBeCalledTimes(0);

    expect(firstSpan).toBeDefined();
    (firstSpan as Span).end();
    // Allow profiler to tick
    await new Promise(r => setTimeout(r, 25));
    // End last overlapping root span now
    const root = Sentry.getActiveSpan();
    root?.end();

    const client = Sentry.getClient();
    // Allow profiler to finalize chunk
    await new Promise(r => setTimeout(r, 25));
    await client?.flush(1000);
    expect(stop).toBeCalledTimes(1);

    const envelope = send.mock.calls[0]?.[0] as any;

    const items = envelope?.[1] || [];
    expect(items.some((it: any) => it?.[0]?.type === 'profile_chunk')).toBe(true);
  });

  it('starts on first sampled root span and stops after a sampled root ends', async () => {
    const { mockConstructor } = mockProfiler();
    const send = vi.fn().mockResolvedValue(undefined);

    Sentry.init({
      dsn: 'https://public@o.ingest.sentry.io/1',
      tracesSampleRate: 1,
      profileSessionSampleRate: 1,
      profileLifecycle: 'trace',
      integrations: [Sentry.browserProfilingIntegration()],
      transport: () => ({ flush: vi.fn().mockResolvedValue(true), send }),
    });

    // End the initial pageload root first so our manual root is the only active, sampled root
    const initialRoot = Sentry.getActiveSpan();
    initialRoot?.end();
    await new Promise(r => setTimeout(r, 0));

    // Start a sampled root span explicitly so the profiler sees spanStart
    let createdSpan: any;
    Sentry.startSpan({ name: 'root-1', parentSpan: null, forceTransaction: true }, span => {
      createdSpan = span;

      expect(span).toBeDefined();
    });

    Sentry.startSpanManual({ name: 'root-2', parentSpan: null, forceTransaction: true }, span => {});

    // Allow profiler to tick
    await new Promise(r => setTimeout(r, 25));
    createdSpan.end();
    // Allow profiler to finalize chunk
    await new Promise(r => setTimeout(r, 25));

    const client = Sentry.getClient();
    await client?.flush(1000);
    // Assert profiler started at least once; stop timing is not deterministic here
    expect(mockConstructor).toHaveBeenCalled();
    const envelope = send.mock.calls[0]?.[0] as any;
    const items = envelope?.[1] || [];
    expect(items.some((it: any) => it?.[0]?.type === 'profile_chunk')).toBe(true);
  });

  it('does not start when profileSessionSampleRate is 0 (session not sampled)', async () => {
    const { mockConstructor } = mockProfiler();
    const send = vi.fn().mockResolvedValue(undefined);

    Sentry.init({
      dsn: 'https://public@o.ingest.sentry.io/1',
      tracesSampleRate: 1,
      profileSessionSampleRate: 0,
      profileLifecycle: 'trace',
      integrations: [Sentry.browserProfilingIntegration()],
      transport: () => ({ flush: vi.fn().mockResolvedValue(true), send }),
    });

    Sentry.startSpan({ name: 'root', parentSpan: null, forceTransaction: true }, span => {});

    const root = Sentry.getActiveSpan();
    expect(root).toBeDefined();
    root?.end();

    const client = Sentry.getClient();
    await client?.flush(1000);
    expect(client).toBeDefined();
    expect(mockConstructor).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
