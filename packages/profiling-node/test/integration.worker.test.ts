import type { ProfilingIntegration, Transport } from '@sentry/core';
import * as Sentry from '@sentry/node';
import { CpuProfilerBindings } from '@sentry-internal/node-cpu-profiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { _nodeProfilingIntegration } from '../src/integration';

// Mock the modules before the import, so that the value is initialized before the module is loaded
vi.mock('worker_threads', () => {
  return {
    isMainThread: false,
    threadId: 9999,
  };
});
vi.setConfig({ testTimeout: 10_000 });

function makeClient(options: Partial<Sentry.NodeOptions> = {}): [Sentry.NodeClient, Transport] {
  const integration = _nodeProfilingIntegration();
  const client = new Sentry.NodeClient({
    stackParser: Sentry.defaultStackParser,
    tracesSampleRate: 1,
    debug: true,
    environment: 'test-environment',
    dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
    integrations: [integration],
    transport: _opts =>
      Sentry.makeNodeTransport({
        url: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
        recordDroppedEvent: () => {
          return undefined;
        },
      }),
    ...options,
  });

  return [client, client.getTransport() as Transport];
}

describe('worker threads', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not start continuous profiling in worker threads', () => {
    const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');

    const [client] = makeClient();
    Sentry.setCurrentClient(client);
    client.init();

    const integration = client.getIntegrationByName<ProfilingIntegration<any>>('ProfilingIntegration');
    if (!integration) {
      throw new Error('Profiling integration not found');
    }

    // Calling start should be a no-op in a worker thread
    integration._profiler.start();

    const transaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
    transaction.end();

    // The native profiler should never have been called
    expect(startProfilingSpy).not.toHaveBeenCalled();

    integration._profiler.stop();
  });

  it('does not start span profiling in worker threads', () => {
    const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');

    const [client] = makeClient({ profilesSampleRate: 1 });
    Sentry.setCurrentClient(client);
    client.init();

    const transaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
    transaction.end();

    // The native profiler should never have been called even with profilesSampleRate set
    expect(startProfilingSpy).not.toHaveBeenCalled();
  });

  it('does not start trace lifecycle profiling in worker threads', () => {
    const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');

    const [client] = makeClient({
      profileSessionSampleRate: 1.0,
      profileLifecycle: 'trace',
    });
    Sentry.setCurrentClient(client);
    client.init();

    const transaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
    transaction.end();

    // The native profiler should never have been called
    expect(startProfilingSpy).not.toHaveBeenCalled();
  });
});
