/**
 * @vitest-environment jsdom
 */

import * as Sentry from '@sentry/browser';
import { debug, type Span } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { BrowserOptions } from '../../src/index';

function getBaseOptionsForTraceLifecycle(sendMock: Mock<any>, enableTracing = true): BrowserOptions {
  return {
    dsn: 'https://public@o.ingest.sentry.io/1',
    ...(enableTracing ? { tracesSampleRate: 1 } : {}),
    profileSessionSampleRate: 1,
    profileLifecycle: 'trace',
    integrations: [Sentry.browserProfilingIntegration()],
    transport: () => ({ flush: vi.fn().mockResolvedValue(true), send: sendMock }),
  };
}

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
      ...getBaseOptionsForTraceLifecycle(send, false),
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
        ...getBaseOptionsForTraceLifecycle(send),
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
      expect(profileChunkEnvelopeHeader?.platform).toBe('javascript');
      expect(transactionEnvelopeHeader?.type).toBe('transaction');
    });

    it('continues while any sampled root span is active; stops after last ends', async () => {
      const { stop, mockConstructor } = mockProfiler();
      const send = vi.fn().mockResolvedValue(undefined);

      Sentry.init({
        ...getBaseOptionsForTraceLifecycle(send),
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
        ...getBaseOptionsForTraceLifecycle(send),
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

    it('emits periodic chunks every 60s while span is stuck (no spanEnd)', async () => {
      const { stop, mockConstructor } = mockProfiler();
      const send = vi.fn().mockResolvedValue(undefined);

      Sentry.init({
        ...getBaseOptionsForTraceLifecycle(send),
      });

      let spanRef: any;
      Sentry.startSpanManual({ name: 'root-interval', parentSpan: null, forceTransaction: true }, span => {
        spanRef = span;
      });

      expect(mockConstructor).toHaveBeenCalledTimes(1);

      // Advance timers by 60s to trigger first periodic chunk while still running
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();

      // One chunk sent and profiler restarted for the next period
      expect(stop.mock.calls.length).toBe(1);
      expect(send.mock.calls.length).toBe(1);
      expect(mockConstructor.mock.calls.length).toBe(2);
      const firstChunkHeader = send.mock.calls?.[0]?.[0]?.[1]?.[0]?.[0];
      expect(firstChunkHeader?.type).toBe('profile_chunk');
      expect(firstChunkHeader?.platform).toBe('javascript');

      // Second chunk after another 60s
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      expect(stop.mock.calls.length).toBe(2);
      expect(send.mock.calls.length).toBe(2);
      expect(mockConstructor.mock.calls.length).toBe(3);

      // Third chunk after another 60s
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      expect(stop.mock.calls.length).toBe(3);
      expect(send.mock.calls.length).toBe(3);
      expect(mockConstructor.mock.calls.length).toBe(4);

      spanRef.end();
      vi.advanceTimersByTime(100_000);
      await Promise.resolve();

      // All chunks should have been sent (4 total)
      expect(stop.mock.calls.length).toBe(4);
      expect(mockConstructor.mock.calls.length).toBe(4); // still 4
      expect(send.mock.calls.length).toBe(5); // 4 chunks + 1 transaction (tested below)

      const countProfileChunks = send.mock.calls.filter(obj => obj?.[0]?.[1]?.[0]?.[0].type === 'profile_chunk').length;
      const countTransactions = send.mock.calls.filter(obj => obj?.[0]?.[1]?.[0]?.[0].type === 'transaction').length;
      expect(countProfileChunks).toBe(4);
      expect(countTransactions).toBe(1);
    });

    it('emits periodic chunks and stops after timeout if manual root span never ends', async () => {
      const { stop, mockConstructor } = mockProfiler();
      const send = vi.fn().mockResolvedValue(undefined);

      Sentry.init({
        ...getBaseOptionsForTraceLifecycle(send),
      });

      Sentry.startSpanManual({ name: 'root-manual-never-ends', parentSpan: null, forceTransaction: true }, _span => {
        // keep open - don't end
      });

      expect(mockConstructor).toHaveBeenCalledTimes(1);

      // Creates 2 profile chunks
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();

      // At least two chunks emitted and profiler restarted in between
      const stopsBeforeKill = stop.mock.calls.length;
      const sendsBeforeKill = send.mock.calls.length;
      const constructorCallsBeforeKill = mockConstructor.mock.calls.length;
      expect(stopsBeforeKill).toBe(2);
      expect(sendsBeforeKill).toBe(2);
      expect(constructorCallsBeforeKill).toBe(3);

      // Advance to session kill switch (~5 minutes total since start)
      vi.advanceTimersByTime(180_000); // now 300s total
      await Promise.resolve();

      const stopsAtKill = stop.mock.calls.length;
      const sendsAtKill = send.mock.calls.length;
      const constructorCallsAtKill = mockConstructor.mock.calls.length;
      // 5min/60sec interval = 5 send/stop calls and 5 calls of constructor total
      expect(constructorCallsAtKill).toBe(constructorCallsBeforeKill + 2); // constructor was already called 3 times
      expect(stopsAtKill).toBe(stopsBeforeKill + 3);
      expect(sendsAtKill).toBe(sendsBeforeKill + 3);

      // No calls should happen after kill
      vi.advanceTimersByTime(120_000);
      await Promise.resolve();
      expect(stop.mock.calls.length).toBe(stopsAtKill);
      expect(send.mock.calls.length).toBe(sendsAtKill);
      expect(mockConstructor.mock.calls.length).toBe(constructorCallsAtKill);
    });

    it('continues profiling for another rootSpan after one rootSpan profile timed-out', async () => {
      const { stop, mockConstructor } = mockProfiler();
      const send = vi.fn().mockResolvedValue(undefined);

      Sentry.init({
        ...getBaseOptionsForTraceLifecycle(send),
      });

      Sentry.startSpanManual({ name: 'root-manual-never-ends', parentSpan: null, forceTransaction: true }, _span => {
        // keep open - don't end
      });

      vi.advanceTimersByTime(300_000); // 5 minutes (kill switch)
      await Promise.resolve();

      const stopsAtKill = stop.mock.calls.length;
      const sendsAtKill = send.mock.calls.length;
      const constructorCallsAtKill = mockConstructor.mock.calls.length;
      // 5min/60sec interval = 5 send/stop calls and 5 calls of constructor total
      expect(constructorCallsAtKill).toBe(5);
      expect(stopsAtKill).toBe(5);
      expect(sendsAtKill).toBe(5);

      let spanRef: Span | undefined;
      Sentry.startSpanManual({ name: 'root-manual-will-end', parentSpan: null, forceTransaction: true }, span => {
        spanRef = span;
      });

      vi.advanceTimersByTime(119_000); // create 2 chunks
      await Promise.resolve();

      spanRef?.end();

      expect(mockConstructor.mock.calls.length).toBe(sendsAtKill + 2);
      expect(stop.mock.calls.length).toBe(constructorCallsAtKill + 2);
      expect(send.mock.calls.length).toBe(stopsAtKill + 2);
    });
  });

  describe('profile context', () => {
    it('sets global profile context on transaction', async () => {
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
        ...getBaseOptionsForTraceLifecycle(send),
      });

      Sentry.startSpan({ name: 'root-for-context', parentSpan: null, forceTransaction: true }, () => {
        /* empty */
      });

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

    it('reuses the same profiler_id across multiple root transactions within one session', async () => {
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
        ...getBaseOptionsForTraceLifecycle(send),
      });

      Sentry.startSpan({ name: 'rootSpan-1', parentSpan: null, forceTransaction: true }, () => {
        /* empty */
      });
      Sentry.startSpan({ name: 'rootSpan-2', parentSpan: null, forceTransaction: true }, () => {
        /* empty */
      });

      await Sentry.getClient()?.flush(1000);

      const calls = send.mock.calls;
      const transactionEvents = calls
        .filter(call => call?.[0]?.[1]?.[0]?.[0]?.type === 'transaction')
        .map(call => call?.[0]?.[1]?.[0]?.[1]);

      expect(transactionEvents.length).toEqual(2);

      const firstProfilerId = transactionEvents[0]?.contexts?.profile?.profiler_id;
      const secondProfilerId = transactionEvents[1]?.contexts?.profile?.profiler_id;

      expect(typeof firstProfilerId).toBe('string');
      expect(typeof secondProfilerId).toBe('string');
      expect(firstProfilerId).toBe(secondProfilerId);
    });

    it('emits profile_chunk items with the same profiler_id as the transactions within a session', async () => {
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
        ...getBaseOptionsForTraceLifecycle(send),
      });

      Sentry.startSpan({ name: 'rootSpan-chunk-1', parentSpan: null, forceTransaction: true }, () => {
        /* empty */
      });
      Sentry.startSpan({ name: 'rootSpan-chunk-2', parentSpan: null, forceTransaction: true }, () => {
        /* empty */
      });

      await Sentry.getClient()?.flush(1000);

      const calls = send.mock.calls;
      const transactionEvents = calls
        .filter(call => call?.[0]?.[1]?.[0]?.[0]?.type === 'transaction')
        .map(call => call?.[0]?.[1]?.[0]?.[1]);

      expect(transactionEvents.length).toBe(2);
      const expectedProfilerId = transactionEvents[0]?.contexts?.profile?.profiler_id;
      expect(typeof expectedProfilerId).toBe('string');

      const profileChunks = calls
        .filter(call => call?.[0]?.[1]?.[0]?.[0]?.type === 'profile_chunk')
        .map(call => call?.[0]?.[1]?.[0]?.[1]);

      expect(profileChunks.length).toBe(2);

      for (const chunk of profileChunks) {
        expect(chunk?.profiler_id).toBe(expectedProfilerId);
      }
    });

    it('changes profiler_id when a new user session starts (new SDK init)', async () => {
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

      // Session 1
      const send1 = vi.fn().mockResolvedValue(undefined);
      Sentry.init({
        ...getBaseOptionsForTraceLifecycle(send1),
      });

      Sentry.startSpan({ name: 'session-1-rootSpan', parentSpan: null, forceTransaction: true }, () => {
        /* empty */
      });

      let client = Sentry.getClient();
      await client?.flush(1000);

      // Extract first session profiler_id from transaction and a chunk
      const calls1 = send1.mock.calls;
      const txnEvt1 = calls1.find(call => call?.[0]?.[1]?.[0]?.[0]?.type === 'transaction')?.[0]?.[1]?.[0]?.[1];
      const chunks1 = calls1
        .filter(call => call?.[0]?.[1]?.[0]?.[0]?.type === 'profile_chunk')
        .map(call => call?.[0]?.[1]?.[0]?.[1]);

      const profilerId1 = txnEvt1?.contexts?.profile?.profiler_id as string | undefined;
      expect(typeof profilerId1).toBe('string');
      expect(chunks1.length).toBe(1);
      for (const chunk of chunks1) {
        expect(chunk?.profiler_id).toBe(profilerId1);
      }

      // End Session 1
      await client?.close();

      // Session 2 (new init simulates new user session)
      const send2 = vi.fn().mockResolvedValue(undefined);
      Sentry.init({
        ...getBaseOptionsForTraceLifecycle(send2),
      });

      Sentry.startSpan({ name: 'session-2-rootSpan', parentSpan: null, forceTransaction: true }, () => {
        /* empty */
      });

      client = Sentry.getClient();
      await client?.flush(1000);

      const calls2 = send2.mock.calls;
      const txnEvt2 = calls2.find(call => call?.[0]?.[1]?.[0]?.[0]?.type === 'transaction')?.[0]?.[1]?.[0]?.[1];
      const chunks2 = calls2
        .filter(call => call?.[0]?.[1]?.[0]?.[0]?.type === 'profile_chunk')
        .map(call => call?.[0]?.[1]?.[0]?.[1]);

      const profilerId2 = txnEvt2?.contexts?.profile?.profiler_id as string | undefined;
      expect(typeof profilerId2).toBe('string');
      expect(profilerId2).not.toBe(profilerId1);
      expect(chunks2.length).toBe(1);
      for (const chunk of chunks2) {
        expect(chunk?.profiler_id).toBe(profilerId2);
      }
    });
  });

  it('calling start and stop in trace lifecycle prints warnings', async () => {
    const { stop } = mockProfiler();
    const send = vi.fn().mockResolvedValue(undefined);
    const debugWarnSpy = vi.spyOn(debug, 'warn');

    Sentry.init({
      ...getBaseOptionsForTraceLifecycle(send),
      debug: true,
    });

    Sentry.uiProfiler.startProfiler();
    Sentry.uiProfiler.startProfiler();

    expect(debugWarnSpy).toHaveBeenCalledWith(
      '[Profiling] `profileLifecycle` is set to "trace". Calls to `uiProfiler.start()` are ignored in trace mode.',
    );

    Sentry.uiProfiler.stopProfiler();
    await Promise.resolve();

    debugWarnSpy.mockClear();
    Sentry.uiProfiler.stopProfiler();
    await Promise.resolve();

    expect(stop).toHaveBeenCalledTimes(0);
    expect(debugWarnSpy).toHaveBeenCalledWith(
      '[Profiling] `profileLifecycle` is set to "trace". Calls to `uiProfiler.stop()` are ignored in trace mode.',
    );
  });
});

function getBaseOptionsForManualLifecycle(sendMock: Mock<any>, enableTracing = true): BrowserOptions {
  return {
    dsn: 'https://public@o.ingest.sentry.io/1',
    ...(enableTracing ? { tracesSampleRate: 1 } : {}),
    profileSessionSampleRate: 1,
    profileLifecycle: 'manual',
    integrations: [Sentry.browserProfilingIntegration()],
    transport: () => ({ flush: vi.fn().mockResolvedValue(true), send: sendMock }),
  };
}

describe('Browser Profiling v2 manual lifecycle', () => {
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

  it('starts and stops a profile session', async () => {
    const { stop, mockConstructor } = mockProfiler();
    const send = vi.fn().mockResolvedValue(undefined);

    Sentry.init({
      ...getBaseOptionsForManualLifecycle(send),
    });

    const client = Sentry.getClient();
    expect(client).toBeDefined();

    Sentry.uiProfiler.startProfiler();
    expect(mockConstructor).toHaveBeenCalledTimes(1);

    Sentry.uiProfiler.stopProfiler();
    await Promise.resolve();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    const envelopeHeader = send.mock.calls?.[0]?.[0]?.[1]?.[0]?.[0];
    expect(envelopeHeader?.type).toBe('profile_chunk');
    expect(envelopeHeader?.platform).toBe('javascript');
  });

  it('calling start and stop while profile session is running prints warnings', async () => {
    const { stop, mockConstructor } = mockProfiler();
    const send = vi.fn().mockResolvedValue(undefined);
    const debugWarnSpy = vi.spyOn(debug, 'warn');

    Sentry.init({
      ...getBaseOptionsForManualLifecycle(send),
      debug: true,
    });

    Sentry.uiProfiler.startProfiler();
    Sentry.uiProfiler.startProfiler();

    expect(mockConstructor).toHaveBeenCalledTimes(1);
    expect(debugWarnSpy).toHaveBeenCalledWith(
      '[Profiling] Profile session is already running, `uiProfiler.start()` is a no-op.',
    );

    Sentry.uiProfiler.stopProfiler();
    await Promise.resolve();

    debugWarnSpy.mockClear();
    Sentry.uiProfiler.stopProfiler();
    await Promise.resolve();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(debugWarnSpy).toHaveBeenCalledWith('[Profiling] Profiler is not running, `uiProfiler.stop()` is a no-op.');
  });

  it('profileSessionSampleRate is required', async () => {
    const { stop, mockConstructor } = mockProfiler();
    const send = vi.fn().mockResolvedValue(undefined);
    const debugWarnSpy = vi.spyOn(debug, 'warn');

    Sentry.init({
      ...getBaseOptionsForManualLifecycle(send),
      profileSessionSampleRate: undefined,
    });

    Sentry.uiProfiler.startProfiler();
    expect(debugWarnSpy).toHaveBeenCalledWith(
      '[Profiling] Invalid sample rate. Sample rate must be a boolean or a number between 0 and 1. Got undefined of type "undefined".',
    );
    expect(debugWarnSpy).toHaveBeenCalledWith('[Profiling] Session is not sampled, `uiProfiler.start()` is a no-op.');
    Sentry.uiProfiler.stopProfiler();
    await Promise.resolve();

    expect(mockConstructor).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it('does not start profiler when profileSessionSampleRate is 0', async () => {
    const { stop, mockConstructor } = mockProfiler();
    const send = vi.fn().mockResolvedValue(undefined);

    Sentry.init({
      ...getBaseOptionsForManualLifecycle(send),
      profileSessionSampleRate: 0,
    });

    Sentry.uiProfiler.startProfiler();
    Sentry.uiProfiler.stopProfiler();
    await Promise.resolve();

    expect(mockConstructor).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  describe('envelope', () => {
    beforeEach(() => {
      vi.useRealTimers();
    });

    it('sends a profile_chunk envelope type', async () => {
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
        ...getBaseOptionsForManualLifecycle(send),
      });

      const client = Sentry.getClient();

      Sentry.uiProfiler.startProfiler();
      await new Promise(resolve => setTimeout(resolve, 10));
      Sentry.uiProfiler.stopProfiler();

      await client?.flush(1000);

      expect(send.mock.calls?.[0]?.[0]?.[1]?.[0]?.[0]).toMatchObject({
        type: 'profile_chunk',
      });

      expect(send.mock.calls?.[0]?.[0]?.[1]?.[0]?.[1]).toMatchObject({
        profiler_id: expect.any(String),
        chunk_id: expect.any(String),
        profile: expect.objectContaining({
          stacks: expect.any(Array),
        }),
      });
    });

    it('reuses the same profiler_id while profiling across multiple stop/start calls', async () => {
      mockProfiler();
      const send = vi.fn().mockResolvedValue(undefined);

      Sentry.init({
        ...getBaseOptionsForManualLifecycle(send),
      });

      // 1. profiling cycle
      Sentry.uiProfiler.startProfiler();
      Sentry.startSpan({ name: 'manual-span-1', parentSpan: null, forceTransaction: true }, () => {});
      Sentry.uiProfiler.stopProfiler();
      await Promise.resolve();

      // Not profiled -> should not have profile context
      Sentry.startSpan({ name: 'manual-span-between', parentSpan: null, forceTransaction: true }, () => {});

      // 2. profiling cycle
      Sentry.uiProfiler.startProfiler();
      Sentry.startSpan({ name: 'manual-span-2', parentSpan: null, forceTransaction: true }, () => {});
      Sentry.uiProfiler.stopProfiler();
      await Promise.resolve();

      const client = Sentry.getClient();
      await client?.flush(1000);

      const calls = send.mock.calls;
      const transactionEvents = calls
        .filter(call => call?.[0]?.[1]?.[0]?.[0]?.type === 'transaction')
        .map(call => call?.[0]?.[1]?.[0]?.[1]);

      expect(transactionEvents.length).toBe(3);

      const firstProfilerId = transactionEvents[0]?.contexts?.profile?.profiler_id;
      expect(typeof firstProfilerId).toBe('string');

      // Middle transaction (not profiled)
      expect(transactionEvents[1]?.contexts?.profile?.profiler_id).toBeUndefined();

      const thirdProfilerId = transactionEvents[2]?.contexts?.profile?.profiler_id;
      expect(typeof thirdProfilerId).toBe('string');
      expect(firstProfilerId).toBe(thirdProfilerId); // same profiler_id across session
    });
  });
});
