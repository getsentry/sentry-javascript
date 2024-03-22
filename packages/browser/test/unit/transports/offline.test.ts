import 'fake-indexeddb/auto';

import { TextDecoder, TextEncoder } from 'util';
import { createTransport } from '@sentry/core';
import type {
  EventEnvelope,
  EventItem,
  InternalBaseTransportOptions,
  TransportMakeRequestResponse,
} from '@sentry/types';
import { createEnvelope } from '@sentry/utils';

import { MIN_DELAY } from '../../../../core/src/transports/offline';
import { createStore, insert, makeBrowserOfflineTransport, pop } from '../../../src/transports/offline';

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

const transportOptions = {
  recordDroppedEvent: () => undefined, // noop
};

type MockResult<T> = T | Error;

export const createTestTransport = (...sendResults: MockResult<TransportMakeRequestResponse>[]) => {
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

  it('indexedDb wrappers insert and pop', async () => {
    const store = createStore('test', 'test');
    const found = await pop(store);
    expect(found).toBeUndefined();

    await insert(store, 'test1', 30);
    await insert(store, new Uint8Array([1, 2, 3, 4, 5]), 30);

    const found2 = await pop(store);
    expect(found2).toEqual('test1');
    const found3 = await pop(store);
    expect(found3).toEqual(new Uint8Array([1, 2, 3, 4, 5]));

    const found4 = await pop(store);
    expect(found4).toBeUndefined();
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

    await delay(MIN_DELAY * 2);

    expect(queuedCount).toEqual(1);
    expect(getSendCount()).toEqual(2);
  });
});
