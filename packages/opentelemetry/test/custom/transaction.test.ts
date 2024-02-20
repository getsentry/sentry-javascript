import { Transaction, getCurrentHub, setCurrentClient, spanToJSON } from '@sentry/core';
import { startTransaction } from '../../src/custom/transaction';
import { TestClient, getDefaultTestClientOptions } from '../helpers/TestClient';

describe('startTranscation', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('creates a Transaction', () => {
    const client = new TestClient(getDefaultTestClientOptions());
    // eslint-disable-next-line deprecation/deprecation
    const hub = getCurrentHub();
    setCurrentClient(client);
    client.init();

    const transaction = startTransaction(hub, { name: 'test' });

    expect(transaction).toBeInstanceOf(Transaction);
    expect(transaction['_sampled']).toBe(undefined);
    // eslint-disable-next-line deprecation/deprecation
    expect(transaction.spanRecorder).toBeDefined();
    // eslint-disable-next-line deprecation/deprecation
    expect(transaction.spanRecorder?.spans).toHaveLength(1);
    // eslint-disable-next-line deprecation/deprecation
    expect(transaction.metadata).toEqual({
      spanMetadata: {},
    });

    expect(spanToJSON(transaction)).toEqual(
      expect.objectContaining({
        origin: 'manual',
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        trace_id: expect.any(String),
      }),
    );
  });

  it('allows to pass data to transaction', () => {
    const client = new TestClient(getDefaultTestClientOptions());
    // eslint-disable-next-line deprecation/deprecation
    const hub = getCurrentHub();
    setCurrentClient(client);
    client.init();

    const transaction = startTransaction(hub, {
      name: 'test',
      startTimestamp: 1234,
      spanId: 'span1',
      traceId: 'trace1',
    });

    expect(transaction).toBeInstanceOf(Transaction);
    // eslint-disable-next-line deprecation/deprecation
    expect(transaction.metadata).toEqual({
      spanMetadata: {},
    });

    expect(spanToJSON(transaction)).toEqual(
      expect.objectContaining({
        origin: 'manual',
        span_id: 'span1',
        start_timestamp: 1234,
        trace_id: 'trace1',
      }),
    );
  });
});
