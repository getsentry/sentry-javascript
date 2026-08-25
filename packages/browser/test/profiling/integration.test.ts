/**
 * @vitest-environment jsdom
 */

import {
  init,
  getClient,
  spanToStaticSpanJSON,
  getActiveSpan,
  browserTracingIntegration,
  browserProfilingIntegration,
} from '../../src/index';
import { debug } from '@sentry/core/browser';
import { describe, expect, it, vi } from 'vitest';
import type { BrowserClient } from '../../src/index';

describe('BrowserProfilingIntegration', () => {
  it('profiles an already active pageload span in trace lifecycle mode', async () => {
    const stopProfile = vi.fn().mockResolvedValue({
      frames: [{ name: 'pageload_fn', line: 1, column: 1 }],
      stacks: [{ frameId: 0 }],
      samples: [
        { stackId: 0, timestamp: 0 },
        { stackId: 0, timestamp: 100 },
      ],
      resources: [],
    });

    const mockProfiler = vi.fn().mockImplementation(() => ({
      stop: stopProfile,
      addEventListener: vi.fn(),
    }));

    // @ts-expect-error this is a mock constructor
    window.Profiler = mockProfiler;

    const send = vi.fn().mockResolvedValue(undefined);
    const client = init({
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      profileSessionSampleRate: 1,
      profileLifecycle: 'trace',
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      transport: () => ({
        flush: vi.fn().mockResolvedValue(true),
        send,
      }),
      integrations: [browserTracingIntegration(), browserProfilingIntegration()],
    });

    const pageloadSpan = getActiveSpan();
    expect(pageloadSpan).toBeDefined();
    expect(spanToStaticSpanJSON(pageloadSpan!).op).toBe('pageload');
    expect(mockProfiler).toHaveBeenCalledTimes(1);

    // Ending the only active root span closes the trace-lifecycle profile.
    pageloadSpan?.end();
    await Promise.resolve();
    await client?.flush(1000);

    expect(stopProfile).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);

    // Continuous Profiling sends separate envelopes
    const transactionEnvelope = send.mock.calls.find(call => call[0][1][0][0].type === 'transaction')?.[0];
    const profileChunkEnvelope = send.mock.calls.find(call => call[0][1][0][0].type === 'profile_chunk')?.[0];
    expect(transactionEnvelope).toBeDefined();
    expect(profileChunkEnvelope).toBeDefined();

    const transaction = transactionEnvelope?.[1][0]?.[1];
    const profileChunk = profileChunkEnvelope?.[1][0]?.[1];

    expect(transaction).toMatchObject({
      contexts: { trace: { op: 'pageload' }, profile: { profiler_id: expect.any(String) } },
    });
    expect(profileChunk).toMatchObject({
      version: '2',
      platform: 'javascript',
      profiler_id: transaction.contexts.profile.profiler_id,
      profile: {
        frames: [expect.objectContaining({ function: 'pageload_fn', lineno: 1, colno: 1 })],
      },
    });
    // The pageload begins before profiling starts, so profile samples cannot predate the transaction.
    expect(profileChunk.profile.samples[0].timestamp).toBeGreaterThanOrEqual(transaction.start_timestamp);
  });

  it("warns when profileLifecycle is 'trace' but tracing is disabled", async () => {
    const warnSpy = vi.spyOn(debug, 'warn').mockImplementation(() => {});

    // @ts-expect-error mock constructor
    window.Profiler = class {
      stopped: boolean = false;
      constructor(_opts: { sampleInterval: number; maxBufferSize: number }) {}
      stop() {
        this.stopped = true;
        return Promise.resolve({ frames: [], stacks: [], samples: [], resources: [] });
      }
    };

    init({
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      // no tracesSampleRate and no tracesSampler → tracing disabled
      profileLifecycle: 'trace',
      profileSessionSampleRate: 1,
      integrations: [browserProfilingIntegration()],
    });

    expect(
      warnSpy.mock.calls.some(call =>
        String(call?.[1] ?? call?.[0]).includes("`profileLifecycle` is 'trace' but tracing is disabled"),
      ),
    ).toBe(true);

    warnSpy.mockRestore();
  });

  it("auto-sets profileLifecycle to 'manual' when not specified", async () => {
    init({
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      integrations: [browserProfilingIntegration()],
    });

    const client = getClient<BrowserClient>();
    const lifecycle = client?.getOptions()?.profileLifecycle;
    expect(lifecycle).toBe('manual');
  });
});
