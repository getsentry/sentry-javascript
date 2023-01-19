import type {
  Envelope,
  EventEnvelope,
  EventItem,
  InternalBaseTransportOptions,
  Transport,
  TransportMakeRequestResponse,
} from '@sentry/types';
import { createEnvelope } from '@sentry/utils';
import { TextEncoder } from 'util';

import { createTransport, makeOfflineTransport } from '../../../src';
import type { CreateOfflineStore } from '../../../src/transports/offline';
import { START_DELAY } from '../../../src/transports/offline';

const ERROR_ENVELOPE = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
  [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem,
]);

const transportOptions = {
  recordDroppedEvent: () => undefined, // noop
  textEncoder: new TextEncoder(),
};

type MockResult<T> = T | Error;

const createTestTransport = (
  ...sendResults: MockResult<TransportMakeRequestResponse>[]
): { getSendCount: () => number; baseTransport: (options: InternalBaseTransportOptions) => Transport } => {
  let sendCount = 0;

  return {
    getSendCount: () => sendCount,
    baseTransport: (options: InternalBaseTransportOptions) =>
      createTransport(options, () => {
        return new Promise((resolve, reject) => {
          const next = sendResults.shift();

          if (next instanceof Error) {
            reject(next);
          } else {
            sendCount += 1;
            resolve(next as TransportMakeRequestResponse | undefined);
          }
        });
      }),
  };
};

type StoreEvents = ('add' | 'pop')[];

function createTestStore(...popResults: MockResult<Envelope | undefined>[]): {
  getCalls: () => StoreEvents;
  store: CreateOfflineStore;
} {
  const calls: StoreEvents = [];

  return {
    getCalls: () => calls,
    store: (maxQueueCount: number) => ({
      insert: async env => {
        if (popResults.length < maxQueueCount) {
          popResults.push(env);
          calls.push('add');
        }
      },
      pop: async () => {
        calls.push('pop');
        const next = popResults.shift();

        if (next instanceof Error) {
          throw next;
        }

        return next;
      },
    }),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('makeOfflineTransport', () => {
  it('Sends envelope and checks the store for further envelopes', async () => {
    expect.assertions(3);

    const { getCalls, store } = createTestStore();
    const { getSendCount, baseTransport } = createTestTransport({ statusCode: 200 });
    const transport = makeOfflineTransport(baseTransport, store)(transportOptions);
    const result = await transport.send(ERROR_ENVELOPE);

    expect(result).toEqual({ statusCode: 200 });
    expect(getSendCount()).toEqual(1);
    // After a successful send, the store should be checked
    expect(getCalls()).toEqual(['pop']);
  });

  it('After successfully sending, sends further envelopes found in the store', async () => {
    const { getCalls, store } = createTestStore(ERROR_ENVELOPE);
    const { getSendCount, baseTransport } = createTestTransport({ statusCode: 200 }, { statusCode: 200 });
    const transport = makeOfflineTransport(baseTransport, store)(transportOptions);
    const result = await transport.send(ERROR_ENVELOPE);

    expect(result).toEqual({ statusCode: 200 });

    await delay(100);

    expect(getSendCount()).toEqual(2);
    // After a successful send, the store should be checked again to ensure it's empty
    expect(getCalls()).toEqual(['pop', 'pop']);
  });

  it('Queues envelope if wrapped transport throws error', async () => {
    const { getCalls, store } = createTestStore();
    const { getSendCount, baseTransport } = createTestTransport(new Error());
    const transport = makeOfflineTransport(baseTransport, store)(transportOptions);
    const result = await transport.send(ERROR_ENVELOPE);

    expect(result).toEqual({});

    await delay(100);

    expect(getSendCount()).toEqual(0);
    expect(getCalls()).toEqual(['add']);
  });

  it('Queues envelope if rate limited', async () => {
    const { getCalls, store } = createTestStore();
    const { getSendCount, baseTransport } = createTestTransport({
      headers: { 'x-sentry-rate-limits': 'something', 'retry-after': null },
    });
    const transport = makeOfflineTransport(baseTransport, store)(transportOptions);
    const result = await transport.send(ERROR_ENVELOPE);
    expect(result).toEqual({});

    await delay(100);

    expect(getSendCount()).toEqual(1);
    expect(getCalls()).toEqual(['add']);
  });

  it(
    'Retries sending envelope after failure',
    async () => {
      const { getCalls, store } = createTestStore();
      const { getSendCount, baseTransport } = createTestTransport(new Error(), { statusCode: 200 });
      const transport = makeOfflineTransport(baseTransport, store)(transportOptions);
      const result = await transport.send(ERROR_ENVELOPE);
      expect(result).toEqual({});
      expect(getCalls()).toEqual(['add']);

      await delay(START_DELAY + 1_000);

      expect(getSendCount()).toEqual(1);
      expect(getCalls()).toEqual(['add', 'pop', 'pop']);
    },
    START_DELAY + 2_000,
  );

  it(
    'When enabled, sends envelopes found in store shortly after startup',
    async () => {
      const { getCalls, store } = createTestStore(ERROR_ENVELOPE, ERROR_ENVELOPE);
      const { getSendCount, baseTransport } = createTestTransport({ statusCode: 200 }, { statusCode: 200 });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _transport = makeOfflineTransport(baseTransport, store)({ ...transportOptions, flushAtStartup: true });

      await delay(START_DELAY + 1_000);

      expect(getSendCount()).toEqual(2);
      expect(getCalls()).toEqual(['pop', 'pop', 'pop']);
    },
    START_DELAY + 2_000,
  );
});
