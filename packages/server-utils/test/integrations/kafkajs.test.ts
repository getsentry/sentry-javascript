import { setCurrentClient, spanToJSON } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { isWrappedConsumerCallback, wrapEachBatch, wrapEachMessage } from '../../src/integrations/kafkajs/consumer';
import { startConsumerSpan, startProducerSpan } from '../../src/integrations/kafkajs/spans';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

function setUpClient(traceLifecycle: 'stream' | 'static'): void {
  const client = new TestClient(getDefaultTestClientOptions({ traceLifecycle, tracesSampleRate: 1 }));
  setCurrentClient(client);
  client.init();
}

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

describe('kafkajs span names', () => {
  it('names the streamed batch span after the operation type rather than the upstream `poll`', () => {
    setUpClient('stream');

    const span = startConsumerSpan({ topic: 'my-topic', message: undefined, operationType: 'receive', attributes: {} });

    expect(spanToJSON(span).name).toBe('receive my-topic');
    // The attribute keeps the upstream name. Only the span name changes.
    expect(spanToJSON(span).attributes).toMatchObject({ 'messaging.operation.name': 'poll' });
  });

  it('keeps the upstream `poll` batch span name when span streaming is off', () => {
    setUpClient('static');

    const span = startConsumerSpan({ topic: 'my-topic', message: undefined, operationType: 'receive', attributes: {} });

    expect(spanToJSON(span).name).toBe('poll my-topic');
  });

  it.each(['stream', 'static'] as const)(
    'names per-message and producer spans identically in %s mode',
    traceLifecycle => {
      setUpClient(traceLifecycle);

      const processSpan = startConsumerSpan({
        topic: 'my-topic',
        message: undefined,
        operationType: 'process',
        attributes: {},
      });
      const producerSpan = startProducerSpan('my-topic', { value: 'hi' });

      expect(spanToJSON(processSpan).name).toBe('process my-topic');
      expect(spanToJSON(producerSpan).name).toBe('send my-topic');
    },
  );
});
