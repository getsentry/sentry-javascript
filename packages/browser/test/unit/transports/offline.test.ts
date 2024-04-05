import 'fake-indexeddb/auto';

import { TextDecoder, TextEncoder } from 'util';
import { createTransport } from '@sentry/core';
import type {
  EventEnvelope,
  EventItem,
  InternalBaseTransportOptions,
  ReplayEnvelope,
  ReplayEvent,
  TransportMakeRequestResponse,
} from '@sentry/types';
import {
  createEnvelope,
  createEventEnvelopeHeaders,
  dsnFromString,
  getSdkMetadataForEnvelopeHeader,
  parseEnvelope,
} from '@sentry/utils';

// Credit for this awful hack: https://github.com/vitest-dev/vitest/issues/4043#issuecomment-1905172846
class JSDOMCompatibleTextEncoder extends TextEncoder {
  encode(input: string) {
    if (typeof input !== 'string') {
      throw new TypeError('`input` must be a string');
    }

    const decodedURI = decodeURIComponent(encodeURIComponent(input));
    const arr = new Uint8Array(decodedURI.length);
    const chars = decodedURI.split('');
    for (let i = 0; i < chars.length; i++) {
      arr[i] = decodedURI[i].charCodeAt(0);
    }
    return arr;
  }
}

Object.defineProperty(global, 'TextEncoder', {
  value: JSDOMCompatibleTextEncoder,
  writable: true,
});

import { MIN_DELAY, START_DELAY } from '../../../../core/src/transports/offline';
import { createStore, makeBrowserOfflineTransport, pop, push, unshift } from '../../../src/transports/offline';

function deleteDatabase(name: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

const ERROR_ENVELOPE = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
  [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem,
]);

function createReplayEnvelope(message: string) {
  const event: ReplayEvent = {
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

  const data = 'nothing';

  return createEnvelope<ReplayEnvelope>(
    createEventEnvelopeHeaders(
      event,
      getSdkMetadataForEnvelopeHeader(event),
      undefined,
      dsnFromString('https://public@dsn.ingest.sentry.io/1337'),
    ),
    [
      [{ type: 'replay_event' }, event],
      [
        {
          type: 'replay_recording',
          length: data.length,
        },
        data,
      ],
    ],
  );
}

const transportOptions = {
  recordDroppedEvent: () => undefined, // noop
};

type MockResult<T> = T | Error;

export const createTestTransport = (...sendResults: MockResult<TransportMakeRequestResponse>[]) => {
  const envelopes: Array<string | Uint8Array> = [];

  return {
    getSendCount: () => envelopes.length,
    getSentEnvelopes: () => envelopes,
    baseTransport: (options: InternalBaseTransportOptions) =>
      createTransport(options, ({ body }) => {
        return new Promise((resolve, reject) => {
          const next = sendResults.shift();

          if (next instanceof Error) {
            reject(next);
          } else {
            envelopes.push(body);
            resolve(next as TransportMakeRequestResponse);
          }
        });
      }),
  };
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('makeOfflineTransport', () => {
  beforeAll(async () => {
    await deleteDatabase('sentry');
    (global as any).TextEncoder = TextEncoder;
    (global as any).TextDecoder = TextDecoder;
  });

  it('indexedDb wrappers push, unshift and pop', async () => {
    const store = createStore('test', 'test');
    const found = await pop(store);
    expect(found).toBeUndefined();

    await push(store, 'test1', 30);
    await push(store, new Uint8Array([1, 2, 3, 4, 5]), 30);
    await unshift(store, 'test2', 30);

    const found2 = await pop(store);
    expect(found2).toEqual('test2');
    const found3 = await pop(store);
    expect(found3).toEqual('test1');
    const found4 = await pop(store);
    expect(found4).toEqual(new Uint8Array([1, 2, 3, 4, 5]));

    const found5 = await pop(store);
    expect(found5).toBeUndefined();
  });

  it('Queues and retries envelope if wrapped transport throws error', async () => {
    const { getSendCount, baseTransport } = createTestTransport(new Error(), { statusCode: 200 }, { statusCode: 200 });
    let queuedCount = 0;
    const transport = makeBrowserOfflineTransport(baseTransport)({
      ...transportOptions,
      shouldStore: () => {
        queuedCount += 1;
        return true;
      },
      url: 'http://localhost',
    });
    const result = await transport.send(ERROR_ENVELOPE);

    expect(result).toEqual({});

    await delay(MIN_DELAY * 2);

    expect(getSendCount()).toEqual(0);
    expect(queuedCount).toEqual(1);

    // Sending again will retry the queued envelope too
    const result2 = await transport.send(ERROR_ENVELOPE);
    expect(result2).toEqual({ statusCode: 200 });

    await delay(MIN_DELAY * 5);

    expect(queuedCount).toEqual(1);
    expect(getSendCount()).toEqual(2);
  });

  it('Retains order of replay envelopes', async () => {
    const { getSentEnvelopes, baseTransport } = createTestTransport(
      { statusCode: 200 },
      // We reject the second envelope to ensure the order is still retained
      new Error(),
      { statusCode: 200 },
      { statusCode: 200 },
    );

    const transport = makeBrowserOfflineTransport(baseTransport)({
      ...transportOptions,
      url: 'http://localhost',
    });

    await transport.send(createReplayEnvelope('1'));
    // This one will fail and get resent in order
    await transport.send(createReplayEnvelope('2'));
    await transport.send(createReplayEnvelope('3'));

    await delay(START_DELAY * 2);

    const envelopes = getSentEnvelopes()
      .map(buf => (typeof buf === 'string' ? buf : new TextDecoder().decode(buf)))
      .map(parseEnvelope);

    expect(envelopes).toHaveLength(3);

    // Ensure they're still in the correct order
    expect((envelopes[0][1][0][1] as ErrorEvent).message).toEqual('1');
    expect((envelopes[1][1][0][1] as ErrorEvent).message).toEqual('2');
    expect((envelopes[2][1][0][1] as ErrorEvent).message).toEqual('3');
  }, 25_000);
});
