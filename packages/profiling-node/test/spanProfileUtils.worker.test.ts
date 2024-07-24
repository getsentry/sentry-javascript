import { expect, vi } from 'vitest';

// Mock the modules before the import, so that the value is initialized before the module is loaded
vi.mock('worker_threads', () => {
  return {
    isMainThread: false,
    threadId: 9999,
  };
});

import { constructItWithTimeout } from './test-utils';

// Required because we test a hypothetical long profile
// and we cannot use advance timers as the c++ relies on
// actual event loop ticks that we cannot advance from vitest.
const itWithTimeout = constructItWithTimeout(10_000);

import * as Sentry from '@sentry/node';
import type { Transport } from '@sentry/types';
import { type ProfilingIntegration, _nodeProfilingIntegration } from '../src/integration';

function makeContinuousProfilingClient(): [Sentry.NodeClient, Transport] {
  const integration = _nodeProfilingIntegration();
  const client = new Sentry.NodeClient({
    stackParser: Sentry.defaultStackParser,
    tracesSampleRate: 1,
    profilesSampleRate: undefined,
    environment: 'test-environment',
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    integrations: [integration],
    transport: _opts =>
      Sentry.makeNodeTransport({
        url: 'https://public@dsn.ingest.sentry.io/1337',
        recordDroppedEvent: () => {
          return undefined;
        },
      }),
  });

  return [client, client.getTransport() as Transport];
}

itWithTimeout('worker threads context', () => {
  const [client, transport] = makeContinuousProfilingClient();
  Sentry.setCurrentClient(client);
  client.init();

  const transportSpy = vi.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

  const nonProfiledTransaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
  nonProfiledTransaction.end();

  expect(transportSpy.mock.calls?.[0]?.[0]?.[1]?.[0]?.[1]).not.toMatchObject({
    contexts: {
      profile: {},
    },
  });

  const integration = client.getIntegrationByName<ProfilingIntegration>('ProfilingIntegration');
  if (!integration) {
    throw new Error('Profiling integration not found');
  }

  integration._profiler.start();
  const profiledTransaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
  profiledTransaction.end();
  integration._profiler.stop();

  expect(transportSpy.mock.calls?.[1]?.[0]?.[1]?.[0]?.[1]).toMatchObject({
    contexts: {
      trace: {
        data: expect.objectContaining({
          ['thread.id']: '9999',
          ['thread.name']: 'worker',
        }),
      },
      profile: {
        profiler_id: expect.any(String),
      },
    },
  });
});
