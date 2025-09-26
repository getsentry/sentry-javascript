/**
 * @vitest-environment jsdom
 */

import * as Sentry from '@sentry/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  describe('profiling lifecycle behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('starts on first sampled root span and sends a chunk on stop', async () => {
      const { stop, mockConstructor } = mockProfiler();
      const send = vi.fn().mockResolvedValue(undefined);

      Sentry.init({
        dsn: 'https://public@o.ingest.sentry.io/1',
        tracesSampleRate: 1,
        profileSessionSampleRate: 1,
        profileLifecycle: 'trace',
        integrations: [Sentry.browserProfilingIntegration()],
        transport: () => ({ flush: vi.fn().mockResolvedValue(true), send }),
      });

      let spanRef: any;
      Sentry.startSpanManual({ name: 'root-1', parentSpan: null, forceTransaction: true }, span => {
        spanRef = span;
      });

      expect(mockConstructor).toHaveBeenCalledTimes(1);
      // Ending the only root span should flush one chunk immediately
      spanRef.end();

      // Resolve any pending microtasks
      await Promise.resolve();

      expect(stop).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(2); // one for transaction, one for profile_chunk
      const transactionEnvelopeHeader = send.mock.calls?.[0]?.[0]?.[1]?.[0]?.[0];
      const profileChunkEnvelopeHeader = send.mock.calls?.[1]?.[0]?.[1]?.[0]?.[0];
      expect(profileChunkEnvelopeHeader?.type).toBe('profile_chunk');
      expect(transactionEnvelopeHeader?.type).toBe('transaction');
    });

    it('continues while any sampled root span is active; stops after last ends', async () => {
      const { stop, mockConstructor } = mockProfiler();
      const send = vi.fn().mockResolvedValue(undefined);

      Sentry.init({
        dsn: 'https://public@o.ingest.sentry.io/1',
        tracesSampleRate: 1,
        profileSessionSampleRate: 1,
        profileLifecycle: 'trace',
        integrations: [Sentry.browserProfilingIntegration()],
        transport: () => ({ flush: vi.fn().mockResolvedValue(true), send }),
      });

      let spanA: any;
      Sentry.startSpanManual({ name: 'root-A', parentSpan: null, forceTransaction: true }, span => {
        spanA = span;
      });

      let spanB: any;
      Sentry.startSpanManual({ name: 'root-B', parentSpan: null, forceTransaction: true }, span => {
        spanB = span;
      });

      expect(mockConstructor).toHaveBeenCalledTimes(1);

      // End first root span -> still one active sampled root span; no send yet
      spanA.end();
      await Promise.resolve();
      expect(stop).toHaveBeenCalledTimes(0);
      expect(send).toHaveBeenCalledTimes(1); // only transaction so far
      const envelopeHeadersTxn = send.mock.calls?.[0]?.[0]?.[1]?.[0]?.[0];
      expect(envelopeHeadersTxn?.type).toBe('transaction');

      // End last root span -> should flush one chunk
      spanB.end();
      await Promise.resolve();
      expect(stop).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(3);
      const envelopeHeadersTxn1 = send.mock.calls?.[0]?.[0]?.[1]?.[0]?.[0];
      const envelopeHeadersTxn2 = send.mock.calls?.[1]?.[0]?.[1]?.[0]?.[0];
      const envelopeHeadersProfile = send.mock.calls?.[2]?.[0]?.[1]?.[0]?.[0];

      expect(envelopeHeadersTxn1?.type).toBe('transaction');
      expect(envelopeHeadersTxn2?.type).toBe('transaction');
      expect(envelopeHeadersProfile?.type).toBe('profile_chunk');
    });

    it('sends a periodic chunk every 60s while running and restarts profiler', async () => {
      const { stop, mockConstructor } = mockProfiler();
      const send = vi.fn().mockResolvedValue(undefined);

      Sentry.init({
        dsn: 'https://public@o.ingest.sentry.io/1',
        tracesSampleRate: 1,
        profileSessionSampleRate: 1,
        profileLifecycle: 'trace',
        integrations: [Sentry.browserProfilingIntegration()],
        transport: () => ({ flush: vi.fn().mockResolvedValue(true), send }),
      });

      let spanRef: any;
      Sentry.startSpanManual({ name: 'root-interval', parentSpan: null, forceTransaction: true }, span => {
        spanRef = span;
      });

      expect(mockConstructor).toHaveBeenCalledTimes(1);

      // Advance timers by 60s to trigger scheduled chunk collection
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();

      // One chunk sent and profiler restarted (second constructor call)
      expect(stop).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(1);
      expect(mockConstructor).toHaveBeenCalledTimes(2);
      const envelopeHeaders = send.mock.calls?.[0]?.[0]?.[1]?.[0]?.[0];
      expect(envelopeHeaders?.type).toBe('profile_chunk');

      // Clean up
      spanRef.end();
      await Promise.resolve();
    });
  });

  it('sets global profile context on transaction', async () => {
    // Use real timers to avoid interference with scheduled chunk timer
    vi.useRealTimers();

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

    (window as any).Profiler = vi
      .fn()
      .mockImplementation((opts: { sampleInterval: number; maxBufferSize: number }) => new MockProfilerImpl(opts));

    const send = vi.fn().mockResolvedValue(undefined);

    Sentry.init({
      dsn: 'https://public@o.ingest.sentry.io/1',
      tracesSampleRate: 1,
      profileSessionSampleRate: 1,
      profileLifecycle: 'trace',
      integrations: [Sentry.browserProfilingIntegration()],
      transport: () => ({ flush: vi.fn().mockResolvedValue(true), send }),
    });

    let spanRef: any;
    Sentry.startSpanManual({ name: 'root-for-context', parentSpan: null, forceTransaction: true }, span => {
      spanRef = span;
    });

    // End span to trigger sending of the transaction
    spanRef.end();

    // Allow async tasks to resolve and flush queued envelopes
    const client = Sentry.getClient();
    await client?.flush(1000);

    // Find the transaction envelope among sent envelopes
    const calls = send.mock.calls;
    const txnCall = calls.find(call => call?.[0]?.[1]?.[0]?.[0]?.type === 'transaction');
    expect(txnCall).toBeDefined();

    const transaction = txnCall?.[0]?.[1]?.[0]?.[1];

    expect(transaction).toMatchObject({
      contexts: {
        trace: {
          data: expect.objectContaining({
            ['thread.id']: expect.any(String),
            ['thread.name']: expect.any(String),
          }),
        },
        profile: {
          profiler_id: expect.any(String),
        },
      },
    });
  });
});
