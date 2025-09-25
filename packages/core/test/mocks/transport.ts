import { createTransport } from '../../src/transports/base';
import type { Transport } from '../../src/types-hoist/transport';

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
    createTransport({ recordDroppedEvent: () => undefined }, async () => {
      sendCalled++;
      await sleep(delay);
      sentCount++;
      return {};
    });

  return { makeTransport, getSendCalled: () => sendCalled, getSentCount: () => sentCount, delay };
}
