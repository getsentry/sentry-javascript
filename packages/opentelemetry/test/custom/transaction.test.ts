import { getCurrentHub } from '../../src/custom/hub';
import { OpenTelemetryScope } from '../../src/custom/scope';
import { OpenTelemetryTransaction, startTransaction } from '../../src/custom/transaction';
import { getDefaultTestClientOptions, TestClient } from '../helpers/TestClient';

describe('NodeExperimentalTransaction', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('works with finishWithScope without arguments', () => {
    const client = new TestClient(getDefaultTestClientOptions());

    const mockSend = jest.spyOn(client, 'captureEvent').mockImplementation(() => 'mocked');

    const hub = getCurrentHub();
    hub.bindClient(client);

    const transaction = new OpenTelemetryTransaction({ name: 'test' }, hub);
    transaction.sampled = true;

    const res = transaction.finishWithScope();

    expect(mockSend).toBeCalledTimes(1);
    expect(mockSend).toBeCalledWith(
      expect.objectContaining({
        contexts: {
          trace: {
            span_id: expect.any(String),
            trace_id: expect.any(String),
            origin: 'manual',
          },
        },
        spans: [],
        start_timestamp: expect.any(Number),
        tags: {},
        timestamp: expect.any(Number),
        transaction: 'test',
        type: 'transaction',
        sdkProcessingMetadata: {
          source: 'custom',
          spanMetadata: {},
          dynamicSamplingContext: {
            environment: 'production',
            trace_id: expect.any(String),
            transaction: 'test',
            sampled: 'true',
          },
        },
        transaction_info: { source: 'custom' },
      }),
      { event_id: expect.any(String) },
      undefined,
    );
    expect(res).toBe('mocked');
  });

  it('works with finishWithScope with endTime', () => {
    const client = new TestClient(getDefaultTestClientOptions());

    const mockSend = jest.spyOn(client, 'captureEvent').mockImplementation(() => 'mocked');

    const hub = getCurrentHub();
    hub.bindClient(client);

    const transaction = new OpenTelemetryTransaction({ name: 'test', startTimestamp: 123456 }, hub);
    transaction.sampled = true;

    const res = transaction.finishWithScope(1234567);

    expect(mockSend).toBeCalledTimes(1);
    expect(mockSend).toBeCalledWith(
      expect.objectContaining({
        start_timestamp: 123456,
        timestamp: 1234567,
      }),
      { event_id: expect.any(String) },
      undefined,
    );
    expect(res).toBe('mocked');
  });

  it('works with finishWithScope with endTime & scope', () => {
    const client = new TestClient(getDefaultTestClientOptions());

    const mockSend = jest.spyOn(client, 'captureEvent').mockImplementation(() => 'mocked');

    const hub = getCurrentHub();
    hub.bindClient(client);

    const transaction = new OpenTelemetryTransaction({ name: 'test', startTimestamp: 123456 }, hub);
    transaction.sampled = true;

    const scope = new OpenTelemetryScope();
    scope.setTags({
      tag1: 'yes',
      tag2: 'no',
    });
    scope.setContext('os', { name: 'Custom OS' });

    const res = transaction.finishWithScope(1234567, scope);

    expect(mockSend).toBeCalledTimes(1);
    expect(mockSend).toBeCalledWith(
      expect.objectContaining({
        contexts: {
          trace: {
            span_id: expect.any(String),
            trace_id: expect.any(String),
            origin: 'manual',
          },
        },
        spans: [],
        start_timestamp: 123456,
        tags: {},
        timestamp: 1234567,
        transaction: 'test',
        type: 'transaction',
        sdkProcessingMetadata: {
          source: 'custom',
          spanMetadata: {},
          dynamicSamplingContext: {
            environment: 'production',
            trace_id: expect.any(String),
            transaction: 'test',
            sampled: 'true',
          },
        },
        transaction_info: { source: 'custom' },
      }),
      { event_id: expect.any(String) },
      scope,
    );
    expect(res).toBe('mocked');
  });
});

describe('startTranscation', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('creates a NodeExperimentalTransaction', () => {
    const client = new TestClient(getDefaultTestClientOptions());
    const hub = getCurrentHub();
    hub.bindClient(client);

    const transaction = startTransaction(hub, { name: 'test' });

    expect(transaction).toBeInstanceOf(OpenTelemetryTransaction);

    expect(transaction.sampled).toBe(undefined);
    expect(transaction.spanRecorder).toBeDefined();
    expect(transaction.spanRecorder?.spans).toHaveLength(1);
    expect(transaction.metadata).toEqual({
      source: 'custom',
      spanMetadata: {},
    });

    expect(transaction.toJSON()).toEqual(
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
    const hub = getCurrentHub();
    hub.bindClient(client);

    const transaction = startTransaction(hub, {
      name: 'test',
      startTimestamp: 1234,
      spanId: 'span1',
      traceId: 'trace1',
    });

    expect(transaction).toBeInstanceOf(OpenTelemetryTransaction);

    expect(transaction.metadata).toEqual({
      source: 'custom',
      spanMetadata: {},
    });

    expect(transaction.toJSON()).toEqual(
      expect.objectContaining({
        origin: 'manual',
        span_id: 'span1',
        start_timestamp: 1234,
        trace_id: 'trace1',
      }),
    );
  });
});
