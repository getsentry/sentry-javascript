// Mock the modules before the import, so that the value is initialized before the module is loaded
jest.mock('worker_threads', () => {
  return {
    isMainThread: false,
    threadId: 9999,
  };
});
jest.setTimeout(10000);

import type { Transport } from '@sentry/core';
import { type ProfilingIntegration } from '@sentry/core';
import * as Sentry from '@sentry/node';
import { _nodeProfilingIntegration } from '../src/integration';

function makeContinuousProfilingClient(): [Sentry.NodeClient, Transport] {
  const integration = _nodeProfilingIntegration();
  const client = new Sentry.NodeClient({
    stackParser: Sentry.defaultStackParser,
    tracesSampleRate: 1,
    profilesSampleRate: undefined,
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
  });

  return [client, client.getTransport() as Transport];
}

it('worker threads context', () => {
  const [client, transport] = makeContinuousProfilingClient();
  Sentry.setCurrentClient(client);
  client.init();

  const transportSpy = jest.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

  const nonProfiledTransaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
  nonProfiledTransaction.end();

  expect(transportSpy.mock.calls?.[0]?.[0]?.[1]?.[0]?.[1]).not.toMatchObject({
    contexts: {
      profile: {},
    },
  });

  const integration = client.getIntegrationByName<ProfilingIntegration<any>>('ProfilingIntegration');
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
