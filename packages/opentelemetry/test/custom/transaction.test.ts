import {
  Transaction,
  getCurrentHub,
  getSpanDescendants,
  setCurrentClient,
  spanIsSampled,
  spanToJSON,
} from '@sentry/core';
import { startTransaction } from '../../src/custom/transaction';
import { TestClient, getDefaultTestClientOptions } from '../helpers/TestClient';

describe('startTranscation', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('creates an unsampled transaction', () => {
    const client = new TestClient(getDefaultTestClientOptions());
    // eslint-disable-next-line deprecation/deprecation
    const hub = getCurrentHub();
    setCurrentClient(client);
    client.init();

    const transaction = startTransaction(hub, { name: 'test' });

    expect(transaction).toBeInstanceOf(Transaction);
    expect(transaction['_sampled']).toBe(undefined);
    expect(spanIsSampled(transaction)).toBe(false);
    // unsampled span is filtered out here
    expect(getSpanDescendants(transaction)).toHaveLength(0);
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

  it('creates a sampled transaction', () => {
    const client = new TestClient(getDefaultTestClientOptions());
    // eslint-disable-next-line deprecation/deprecation
    const hub = getCurrentHub();
    setCurrentClient(client);
    client.init();

    const transaction = startTransaction(hub, { name: 'test', sampled: true });

    expect(transaction).toBeInstanceOf(Transaction);
    expect(transaction['_sampled']).toBe(true);
    expect(spanIsSampled(transaction)).toBe(true);
    expect(getSpanDescendants(transaction)).toHaveLength(1);
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
