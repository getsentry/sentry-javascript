/**
 * @vitest-environment jsdom
 */

import * as Sentry from '@sentry/browser';
import { debug } from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';
import type { BrowserClient } from '../../src/index';
import type { JSSelfProfile } from '../../src/profiling/jsSelfProfiling';

describe('BrowserProfilingIntegration', () => {
  it('pageload profiles follow regular transaction code path', async () => {
    const stopProfile = vi.fn().mockImplementation((): Promise<JSSelfProfile> => {
      return Promise.resolve({
        frames: [{ name: 'pageload_fn', line: 1, column: 1 }],
        stacks: [{ frameId: 0, parentId: undefined }],
        samples: [
          { stackId: 0, timestamp: 0 },
          { stackId: 0, timestamp: 100 },
          { stackId: 0, timestamp: 200 },
        ],
        resources: [],
      });
    });

    class MockProfiler {
      stopped: boolean = false;
      constructor(_opts: { sampleInterval: number; maxBufferSize: number }) {}
      stop() {
        this.stopped = true;
        return stopProfile();
      }
    }

    // @ts-expect-error this is a mock constructor
    window.Profiler = MockProfiler;

    const flush = vi.fn().mockImplementation(() => Promise.resolve(true));
    const send = vi.fn().mockImplementation(() => Promise.resolve());
    const client = Sentry.init({
      tracesSampleRate: 1,
      profilesSampleRate: 1,
      environment: 'test-environment',
      dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
      transport: _opts => {
        return {
          flush,
          send,
        };
      },
      integrations: [Sentry.browserTracingIntegration(), Sentry.browserProfilingIntegration()],
    });

    const currentTransaction = Sentry.getActiveSpan();
    expect(currentTransaction).toBeDefined();
    expect(Sentry.spanToJSON(currentTransaction!).op).toBe('pageload');
    currentTransaction?.end();
    await client!.flush(1000);

    expect(send).toHaveBeenCalledTimes(1);

    const profile = send.mock.calls[0]?.[0]?.[1]?.[1]?.[1];
    const transaction = send.mock.calls[0]?.[0]?.[1]?.[0]?.[1];
    const profile_timestamp_ms = new Date(profile.timestamp).getTime();
    const transaction_timestamp_ms = new Date(transaction.start_timestamp * 1e3).getTime();

    expect(profile_timestamp_ms).toBeGreaterThan(transaction_timestamp_ms);
    expect(profile.profile.frames[0]).toMatchObject({ function: 'pageload_fn', lineno: 1, colno: 1 });
  });

  it("warns when profileLifecycle is 'trace' but tracing is disabled", async () => {
    debug.enable();
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

    Sentry.init({
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      // no tracesSampleRate and no tracesSampler → tracing disabled
      profileLifecycle: 'trace',
      profileSessionSampleRate: 1,
      integrations: [Sentry.browserProfilingIntegration()],
    });

    expect(
      warnSpy.mock.calls.some(call =>
        String(call?.[1] ?? call?.[0]).includes("`profileLifecycle` is 'trace' but tracing is disabled"),
      ),
    ).toBe(true);

    warnSpy.mockRestore();
  });

  it("auto-sets profileLifecycle to 'manual' when not specified", async () => {
    Sentry.init({
      dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      integrations: [Sentry.browserProfilingIntegration()],
    });

    const client = Sentry.getClient<BrowserClient>();
    const lifecycle = client?.getOptions()?.profileLifecycle;
    expect(lifecycle).toBe('manual');
  });
});
