import { describe, expect, it } from 'vitest';
import { isWrappedConsumerCallback, wrapEachBatch, wrapEachMessage } from '../../src/integrations/kafkajs/consumer';

// End-to-end span output (producer/consumer, error status, origins) is covered by the node integration
// suite, which runs against a real broker in both OTel and orchestrion modes. This only covers the
// idempotency marker the `run` subscriber relies on to avoid double-wrapping a reused config object —
// a case the integration scenario doesn't exercise.
describe('kafkajs consumer callback wrapping', () => {
  it('marks wrapped callbacks so a reused config is not wrapped twice', () => {
    const userCallback = async (): Promise<void> => undefined;

    expect(isWrappedConsumerCallback(userCallback)).toBe(false);
    expect(isWrappedConsumerCallback(wrapEachMessage(userCallback))).toBe(true);
    expect(isWrappedConsumerCallback(wrapEachBatch(userCallback))).toBe(true);
  });
});
