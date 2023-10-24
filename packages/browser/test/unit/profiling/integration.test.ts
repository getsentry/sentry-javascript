import type { BrowserClient } from '@sentry/browser';
import * as Sentry from '@sentry/browser';

import { BrowserProfilingIntegration } from '../../../src/profiling/integration';
import type { JSSelfProfile } from '../../../src/profiling/jsSelfProfiling';

describe('BrowserProfilingIntegration', () => {
  it('pageload profiles follow regular transaction code path', async () => {
    const stopProfile = jest.fn().mockImplementation((): Promise<JSSelfProfile> => {
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

    const flush = jest.fn().mockImplementation(() => Promise.resolve(true));
    const send = jest.fn().mockImplementation(() => Promise.resolve());
    Sentry.init({
      tracesSampleRate: 1,
      profilesSampleRate: 1,
      debug: true,
      environment: 'test-environment',
      dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
      transport: _opts => {
        return {
          flush,
          send,
        };
      },
      integrations: [new Sentry.BrowserTracing(), new BrowserProfilingIntegration()],
    });

    const client = Sentry.getCurrentHub().getClient() as BrowserClient;

    const currentTransaction = Sentry.getCurrentHub().getScope().getTransaction();
    expect(currentTransaction?.op).toBe('pageload');
    currentTransaction?.finish();
    await client.flush(1000);

    expect(send).toHaveBeenCalledTimes(1);

    const profile = send.mock.calls?.[0]?.[0]?.[1]?.[1]?.[1];
    const transaction = send.mock.calls?.[0]?.[0]?.[1]?.[0]?.[1];
    const profile_timestamp_ms = new Date(profile.timestamp).getTime();
    const transaction_timestamp_ms = new Date(transaction.start_timestamp * 1e3).getTime();

    expect(profile_timestamp_ms).toBeGreaterThan(transaction_timestamp_ms);
    expect(profile.profile.frames[0]).toMatchObject({ function: 'pageload_fn', lineno: 1, colno: 1 });
  });
});
