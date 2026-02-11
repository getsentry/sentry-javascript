import { describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  createClientReportEnvelope,
  createEnvelope,
  createEventEnvelopeHeaders,
  createTransport,
  dsnFromString,
  getSdkMetadataForEnvelopeHeader,
  parseEnvelope,
} from '../../../src';
import type { CreateOfflineStore, OfflineTransportOptions } from '../../../src/transports/offline';
import { makeOfflineTransport, MIN_DELAY, START_DELAY } from '../../../src/transports/offline';
import type { ClientReport } from '../../../src/types-hoist/clientreport';
import type { Envelope, EventEnvelope, EventItem, ReplayEnvelope } from '../../../src/types-hoist/envelope';
import type { ReplayEvent } from '../../../src/types-hoist/replay';
import type { InternalBaseTransportOptions, TransportMakeRequestResponse } from '../../../src/types-hoist/transport';

const ERROR_ENVELOPE = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
  [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem,
]);

function REPLAY_EVENT(message: string): ReplayEvent {
  return {
    type: 'replay_event',
    timestamp: 1670837008.634,
    error_ids: ['errorId'],
    trace_ids: ['traceId'],
    urls: ['https://example.com'],
    replay_id: 'MY_REPLAY_ID',
    segment_id: 3,
    replay_type: 'buffer',
    message,
  };
}

const DSN = dsnFromString('https://public@dsn.ingest.sentry.io/1337')!;

const DATA = 'nothing';

function REPLAY_ENVELOPE(message: string) {
  const event = REPLAY_EVENT(message);
  return createEnvelope<ReplayEnvelope>(
    createEventEnvelopeHeaders(event, getSdkMetadataForEnvelopeHeader(event), undefined, DSN),
    [
      [{ type: 'replay_event' }, event],
      [
        {
          type: 'replay_recording',
          length: DATA.length,
        },
        DATA,
      ],
    ],
  );
}

const DEFAULT_DISCARDED_EVENTS: ClientReport['discarded_events'] = [
  {
    reason: 'before_send',
    category: 'error',
    quantity: 30,
  },
  {
    reason: 'network_error',
    category: 'transaction',
    quantity: 23,
  },
];

const CLIENT_REPORT_ENVELOPE = createClientReportEnvelope(
  DEFAULT_DISCARDED_EVENTS,
  'https://public@dsn.ingest.sentry.io/1337',
  123456,
);

const transportOptions = {
  recordDroppedEvent: () => undefined, // noop
};

type MockResult<T> = T | Error;

const createTestTransport = (...sendResults: MockResult<TransportMakeRequestResponse>[]) => {
  const sentEnvelopes: (string | Uint8Array)[] = [];

  return {
    getSentEnvelopes: () => sentEnvelopes,
    getSendCount: () => sentEnvelopes.length,
    baseTransport: (options: InternalBaseTransportOptions) =>
      createTransport(options, ({ body }) => {
        return new Promise((resolve, reject) => {
          const next = sendResults.shift();

          if (next instanceof Error) {
            reject(next);
          } else {
            sentEnvelopes.push(body);
            resolve(next as TransportMakeRequestResponse);
          }
        });
      }),
  };
};

type StoreEvents = ('push' | 'unshift' | 'shift')[];

function createTestStore(...popResults: MockResult<Envelope | undefined>[]): {
  getCalls: () => StoreEvents;
  store: CreateOfflineStore;
} {
  const calls: StoreEvents = [];

  return {
    getCalls: () => calls,
    store: (_: OfflineTransportOptions) => ({
      push: async env => {
        if (popResults.length < 30) {
          popResults.push(env);
          calls.push('push');
        }
      },
      unshift: async env => {
        if (popResults.length < 30) {
          popResults.unshift(env);
          calls.push('unshift');
        }
      },
      shift: async () => {
        calls.push('shift');
        const next = popResults.shift();

        if (next instanceof Error) {
          throw next;
        }

        return next;
      },
      count: async () => popResults.length,
    }),
  };
}

describe('makeOfflineTransport', () => {
  it('Sends envelope and checks the store for further envelopes', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const { getCalls, store } = createTestStore();
    const { getSendCount, baseTransport } = createTestTransport({ statusCode: 200 });
    let queuedCount = 0;
    const transport = makeOfflineTransport(baseTransport)({
      ...transportOptions,
      createStore: store,
      shouldStore: () => {
        queuedCount += 1;
        return true;
      },
    });
    const result = await transport.send(ERROR_ENVELOPE);

    expect(result).toEqual({ statusCode: 200 });
    expect(queuedCount).toEqual(0);
    expect(getSendCount()).toEqual(1);

    await vi.advanceTimersByTimeAsync(START_DELAY);

    // After a successful send, the store should be checked
    expect(getCalls()).toEqual(['shift']);
  });

  it('Envelopes are added after existing envelopes in the queue', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const { getCalls, store } = createTestStore(ERROR_ENVELOPE);
    const { getSendCount, baseTransport } = createTestTransport({ statusCode: 200 }, { statusCode: 200 });
    const transport = makeOfflineTransport(baseTransport)({ ...transportOptions, createStore: store });
    const result = await transport.send(ERROR_ENVELOPE);

    expect(result).toEqual({ statusCode: 200 });

    await vi.advanceTimersByTimeAsync(START_DELAY);

    expect(getSendCount()).toEqual(2);
    // After a successful send from the store, the store should be checked again to ensure it's empty
    expect(getCalls()).toEqual(['shift', 'shift']);
  });

  it('Queues envelope if wrapped transport throws error', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const { getCalls, store } = createTestStore();
    const { getSendCount, baseTransport } = createTestTransport(new Error());
    let queuedCount = 0;
    const transport = makeOfflineTransport(baseTransport)({
      ...transportOptions,
      createStore: store,
      shouldStore: () => {
        queuedCount += 1;
        return true;
      },
    });
    const result = await transport.send(ERROR_ENVELOPE);

    expect(result).toEqual({});

    await vi.advanceTimersByTimeAsync(1_000);

    expect(getSendCount()).toEqual(0);
    expect(queuedCount).toEqual(1);
    expect(getCalls()).toEqual(['push']);
  });

  it('Does not queue envelopes if status code >= 400', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const { getCalls, store } = createTestStore();
    const { getSendCount, baseTransport } = createTestTransport({ statusCode: 500 });
    let queuedCount = 0;
    const transport = makeOfflineTransport(baseTransport)({
      ...transportOptions,
      createStore: store,
      shouldStore: () => {
        queuedCount += 1;
        return true;
      },
    });
    const result = await transport.send(ERROR_ENVELOPE);

    expect(result).toEqual({ statusCode: 500 });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(getSendCount()).toEqual(1);
    expect(queuedCount).toEqual(0);
    expect(getCalls()).toEqual([]);
  });

  it('Retries sending envelope after failure', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const { getCalls, store } = createTestStore();
    const { getSendCount, baseTransport } = createTestTransport(new Error(), { statusCode: 200 });
    const transport = makeOfflineTransport(baseTransport)({ ...transportOptions, createStore: store });
    const result = await transport.send(ERROR_ENVELOPE);
    expect(result).toEqual({});
    expect(getCalls()).toEqual(['push']);

    await vi.advanceTimersByTimeAsync(START_DELAY * 2);

    expect(getSendCount()).toEqual(1);
    expect(getCalls()).toEqual(['push', 'shift', 'shift']);
  });

  it('When flushAtStartup is enabled, sends envelopes found in store shortly after startup', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const { getCalls, store } = createTestStore(ERROR_ENVELOPE, ERROR_ENVELOPE);
    const { getSendCount, baseTransport } = createTestTransport({ statusCode: 200 }, { statusCode: 200 });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _transport = makeOfflineTransport(baseTransport)({
      ...transportOptions,
      createStore: store,
      flushAtStartup: true,
    });

    await vi.advanceTimersByTimeAsync(START_DELAY * 2);

    expect(getSendCount()).toEqual(2);
    expect(getCalls()).toEqual(['shift', 'shift', 'shift']);
  });

  it('Unshifts envelopes on retry failure', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const { getCalls, store } = createTestStore(ERROR_ENVELOPE);
    const { getSendCount, baseTransport } = createTestTransport(new Error(), { statusCode: 200 });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _transport = makeOfflineTransport(baseTransport)({
      ...transportOptions,
      createStore: store,
      flushAtStartup: true,
    });

    await vi.advanceTimersByTimeAsync(START_DELAY * 2);

    expect(getSendCount()).toEqual(0);
    expect(getCalls()).toEqual(['shift', 'unshift']);
  });

  it('Updates sent_at envelope header on retry', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const testStartTime = new Date();

    // Create an envelope with a sent_at header very far in the past
    const env: EventEnvelope = [...ERROR_ENVELOPE];
    env[0]!.sent_at = new Date(2020, 1, 1).toISOString();

    const { getCalls, store } = createTestStore(ERROR_ENVELOPE);
    const { getSentEnvelopes, baseTransport } = createTestTransport({ statusCode: 200 });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _transport = makeOfflineTransport(baseTransport)({
      ...transportOptions,
      createStore: store,
      flushAtStartup: true,
    });

    await vi.advanceTimersByTimeAsync(START_DELAY);

    expect(getCalls()).toEqual(['shift']);

    // When it gets shifted out of the store, the sent_at header should be updated
    const envelopes = getSentEnvelopes().map(parseEnvelope) as EventEnvelope[];
    expect(envelopes[0]?.[0]).toBeDefined();
    const sent_at = new Date(envelopes[0]![0].sent_at);

    expect(sent_at.getTime()).toBeGreaterThan(testStartTime.getTime());
  });

  it('shouldStore can stop envelopes from being stored on send failure', async () => {
    const { getCalls, store } = createTestStore();
    const { getSendCount, baseTransport } = createTestTransport(new Error());
    const queuedCount = 0;
    const transport = makeOfflineTransport(baseTransport)({
      ...transportOptions,
      createStore: store,
      shouldStore: () => false,
    });
    const result = transport.send(ERROR_ENVELOPE);

    await expect(result).rejects.toBeInstanceOf(Error);
    expect(queuedCount).toEqual(0);
    expect(getSendCount()).toEqual(0);
    expect(getCalls()).toEqual([]);
  });

  it('shouldSend can stop envelopes from being sent', async () => {
    const { getCalls, store } = createTestStore();
    const { getSendCount, baseTransport } = createTestTransport(new Error());
    let queuedCount = 0;
    const transport = makeOfflineTransport(baseTransport)({
      ...transportOptions,
      createStore: store,
      shouldSend: () => false,
      shouldStore: () => {
        queuedCount += 1;
        return true;
      },
    });
    const result = transport.send(ERROR_ENVELOPE);

    await expect(result).resolves.toEqual({});
    expect(queuedCount).toEqual(1);
    expect(getSendCount()).toEqual(0);
    expect(getCalls()).toEqual(['push']);
  });

  it('should not store client report envelopes on send failure', async () => {
    const { getCalls, store } = createTestStore();
    const { getSendCount, baseTransport } = createTestTransport(new Error());
    const queuedCount = 0;
    const transport = makeOfflineTransport(baseTransport)({
      ...transportOptions,
      createStore: store,
      shouldStore: () => true,
    });
    const result = transport.send(CLIENT_REPORT_ENVELOPE);

    await expect(result).rejects.toBeInstanceOf(Error);
    expect(queuedCount).toEqual(0);
    expect(getSendCount()).toEqual(0);
    expect(getCalls()).toEqual([]);
  });

  it('Sends replay envelopes in order', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    const { getCalls, store } = createTestStore(REPLAY_ENVELOPE('1'), REPLAY_ENVELOPE('2'));
    const { getSendCount, getSentEnvelopes, baseTransport } = createTestTransport(
      new Error(),
      { statusCode: 200 },
      { statusCode: 200 },
      { statusCode: 200 },
    );
    const transport = makeOfflineTransport(baseTransport)({ ...transportOptions, createStore: store });
    const result = await transport.send(REPLAY_ENVELOPE('3'));

    expect(result).toEqual({});
    expect(getCalls()).toEqual(['push']);

    await vi.advanceTimersByTimeAsync(START_DELAY + MIN_DELAY * 3);

    expect(getSendCount()).toEqual(3);
    expect(getCalls()).toEqual([
      // We're sending a replay envelope and they always get queued
      'push',
      // The first envelope popped out fails to send so it gets added to the front of the queue
      'shift',
      'unshift',
      // The rest of the attempts succeed
      'shift',
      'shift',
      'shift',
    ]);

    const envelopes = getSentEnvelopes().map(parseEnvelope);

    // Ensure they're still in the correct order
    expect((envelopes[0]?.[1]?.[0]?.[1] as ErrorEvent).message).toEqual('1');
    expect((envelopes[1]?.[1]?.[0]?.[1] as ErrorEvent).message).toEqual('2');
    expect((envelopes[2]?.[1]?.[0]?.[1] as ErrorEvent).message).toEqual('3');
  });

  it(
    'Follows the Retry-After header',
    async () => {
      vi.useFakeTimers();
      onTestFinished(() => {
        vi.useRealTimers();
      });

      const { getCalls, store } = createTestStore(ERROR_ENVELOPE);
      const { getSendCount, baseTransport } = createTestTransport(
        {
          statusCode: 429,
          headers: { 'x-sentry-rate-limits': '', 'retry-after': '3' },
        },
        { statusCode: 200 },
      );

      let queuedCount = 0;
      const transport = makeOfflineTransport(baseTransport)({
        ...transportOptions,
        createStore: store,
        shouldStore: () => {
          queuedCount += 1;
          return true;
        },
      });
      const result = await transport.send(ERROR_ENVELOPE);

      expect(result).toEqual({
        statusCode: 429,
        headers: { 'x-sentry-rate-limits': '', 'retry-after': '3' },
      });

      await vi.advanceTimersByTimeAsync(2_999);

      expect(getSendCount()).toEqual(1);

      await vi.advanceTimersByTimeAsync(START_DELAY);

      expect(getSendCount()).toEqual(2);
      expect(queuedCount).toEqual(0);
      expect(getCalls()).toEqual(['shift', 'shift']);
    },
    START_DELAY * 3,
  );
});
