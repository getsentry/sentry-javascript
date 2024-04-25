import type { Transport } from '@sentry/types';

import { createTransport } from '../../src/transports/base';

async function sleep(delay: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delay));
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
    createTransport({ recordDroppedEvent: () => undefined }, () => {
      sendCalled++;
      return new Promise(resolve => {
        sleep(delay);
        sentCount++;
        resolve({});
      });
    });
  return { makeTransport, getSendCalled: () => sendCalled, getSentCount: () => sentCount, delay };
}
