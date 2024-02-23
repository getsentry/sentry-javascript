import * as Sentry from '@sentry/node-experimental';
import type { Transport } from '@sentry/types';

import { getMainCarrier } from '@sentry/core';
import { ProfilingIntegration } from '../src/index';
import type { Profile } from '../src/types';

interface MockTransport extends Transport {
  events: any[];
}

function makeStaticTransport(): MockTransport {
  return {
    events: [] as any[],
    send: function (...args: any[]) {
      this.events.push(args);
      return Promise.resolve();
    },
    flush: function () {
      return Promise.resolve(true);
    },
  };
}

function makeClientWithoutHooks(): [Sentry.NodeClient, MockTransport] {
  const integration = new ProfilingIntegration();
  const transport = makeStaticTransport();
  const client = new Sentry.NodeClient({
    stackParser: Sentry.defaultStackParser,
    tracesSampleRate: 1,
    profilesSampleRate: 1,
    debug: true,
    environment: 'test-environment',
    dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
    integrations: [integration],
    transport: () => transport,
  });
  // eslint-disable-next-line deprecation/deprecation
  client.setupIntegrations = () => {
    integration.setupOnce(
      cb => {
        // @ts-expect-error __SENTRY__ is private
        getMainCarrier().__SENTRY__.globalEventProcessors = [cb];
      },
      // eslint-disable-next-line deprecation/deprecation
      () => Sentry.getCurrentHub(),
    );
  };
  // @ts-expect-error override private property
  client.on = undefined;
  return [client, transport];
}

function findAllProfiles(transport: MockTransport): [any, Profile][] | null {
  return transport?.events.filter(call => {
    return call[0][1][0][0].type === 'profile';
  });
}

function findProfile(transport: MockTransport): Profile | null {
  return (
    transport?.events.find(call => {
      return call[0][1][0][0].type === 'profile';
    })?.[0][1][0][1] ?? null
  );
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Sentry - Profiling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    // We will mock the carrier as if it has been initialized by the SDK, else everything is short circuited
    getMainCarrier().__SENTRY__ = {};
  });
  afterEach(() => {
    delete getMainCarrier().__SENTRY__;
  });
  describe('without hooks', () => {
    it('profiles a transaction', async () => {
      const [client, transport] = makeClientWithoutHooks();
      // eslint-disable-next-line deprecation/deprecation
      const hub = Sentry.getCurrentHub();
      // eslint-disable-next-line deprecation/deprecation
      hub.bindClient(client);

      // eslint-disable-next-line deprecation/deprecation
      const transaction = Sentry.startTransaction({ name: 'title' });
      await wait(500);
      transaction.end();

      await Sentry.flush(500);
      expect(findProfile(transport)).not.toBe(null);
    });

    it('can profile overlapping transactions', async () => {
      const [client, transport] = makeClientWithoutHooks();
      // eslint-disable-next-line deprecation/deprecation
      const hub = Sentry.getCurrentHub();
      // eslint-disable-next-line deprecation/deprecation
      hub.bindClient(client);

      // eslint-disable-next-line deprecation/deprecation
      const t1 = Sentry.startTransaction({ name: 'outer' });
      // eslint-disable-next-line deprecation/deprecation
      const t2 = Sentry.startTransaction({ name: 'inner' });
      await wait(500);

      t2.end();
      t1.end();

      await Sentry.flush(500);

      expect(findAllProfiles(transport)?.[0]?.[0]?.[1]?.[0]?.[1].transaction.name).toBe('inner');
      expect(findAllProfiles(transport)?.[1]?.[0]?.[1]?.[0]?.[1].transaction.name).toBe('outer');
      expect(findAllProfiles(transport)).toHaveLength(2);
      expect(findProfile(transport)).not.toBe(null);
    });

    it('does not discard overlapping transaction with same title', async () => {
      const [client, transport] = makeClientWithoutHooks();
      // eslint-disable-next-line deprecation/deprecation
      const hub = Sentry.getCurrentHub();
      // eslint-disable-next-line deprecation/deprecation
      hub.bindClient(client);

      // eslint-disable-next-line deprecation/deprecation
      const t1 = Sentry.startTransaction({ name: 'same-title' });
      // eslint-disable-next-line deprecation/deprecation
      const t2 = Sentry.startTransaction({ name: 'same-title' });
      await wait(500);
      t2.end();
      t1.end();

      await Sentry.flush(500);
      expect(findAllProfiles(transport)).toHaveLength(2);
      expect(findProfile(transport)).not.toBe(null);
    });

    it('does not crash if end is called multiple times', async () => {
      const [client, transport] = makeClientWithoutHooks();
      // eslint-disable-next-line deprecation/deprecation
      const hub = Sentry.getCurrentHub();
      // eslint-disable-next-line deprecation/deprecation
      hub.bindClient(client);

      // eslint-disable-next-line deprecation/deprecation
      const transaction = Sentry.startTransaction({ name: 'title' });
      await wait(500);
      transaction.end();
      transaction.end();

      await Sentry.flush(500);
      expect(findAllProfiles(transport)).toHaveLength(1);
      expect(findProfile(transport)).not.toBe(null);
    });
  });
});
