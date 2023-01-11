import type { Transport } from '@sentry/types';
import { SyncPromise } from '@sentry/utils';
import { TextEncoder } from 'util';

import { createTransport } from '../../src/transports/base';

async function sleep(delay: number): Promise<void> {
  return new SyncPromise(resolve => setTimeout(resolve, delay));
}

export function makeFakeTransport(delay: number = 2000): {
  makeTransport: () => Transport;
  getSendCalled: () => number;
  getSentCount: () => number;
  delay: number;
} {
  let sendCalled = 0;
  let sentCount = 0;
  const makeTransport = () =>
    createTransport({ recordDroppedEvent: () => undefined, textEncoder: new TextEncoder() }, () => {
      sendCalled++;
      return new SyncPromise(async res => {
        await sleep(delay);
        sentCount++;
        res({});
      });
    });
  return { makeTransport, getSendCalled: () => sendCalled, getSentCount: () => sentCount, delay };
}
