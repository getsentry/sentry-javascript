import type { Client, DsnComponents, DynamicSamplingContext, Event } from '@sentry/types';

import {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SentrySpan,
  getCurrentScope,
  getIsolationScope,
  setAsyncContextStrategy,
  setCurrentClient,
} from '../../src';
import { createEventEnvelope, createSpanEnvelope } from '../../src/envelope';
import { TestClient, getDefaultTestClientOptions } from '../mocks/client';

const testDsn: DsnComponents = { protocol: 'https', projectId: 'abc', host: 'testry.io', publicKey: 'pubKey123' };

describe('createEventEnvelope', () => {
  describe('trace header', () => {
    const testTable: Array<[string, Event, DynamicSamplingContext]> = [
      [
        'adds minimal baggage items',
        {
          type: 'transaction',
          sdkProcessingMetadata: {
            dynamicSamplingContext: { trace_id: '1234', public_key: 'pubKey123' },
          },
        },
        { trace_id: '1234', public_key: 'pubKey123' },
      ],
      [
        'adds multiple baggage items',
        {
          type: 'transaction',
          sdkProcessingMetadata: {
            dynamicSamplingContext: {
              environment: 'prod',
              release: '1.0.0',
              public_key: 'pubKey123',
              trace_id: '1234',
            },
          },
        },
        { release: '1.0.0', environment: 'prod', trace_id: '1234', public_key: 'pubKey123' },
      ],
      [
        'adds all baggage items',
        {
          type: 'transaction',
          sdkProcessingMetadata: {
            dynamicSamplingContext: {
              environment: 'prod',
              release: '1.0.0',
              transaction: 'TX',
              sample_rate: '0.95',
              public_key: 'pubKey123',
              trace_id: '1234',
            },
          },
        },
        {
          environment: 'prod',
          release: '1.0.0',
          transaction: 'TX',
          sample_rate: '0.95',
          public_key: 'pubKey123',
          trace_id: '1234',
        },
      ],
      [
        'with error event',
        {
          sdkProcessingMetadata: {
            dynamicSamplingContext: { trace_id: '1234', public_key: 'pubKey123' },
          },
        },
        { trace_id: '1234', public_key: 'pubKey123' },
      ],
    ];
    it.each(testTable)('%s', (_: string, event, trace) => {
      const envelopeHeaders = createEventEnvelope(event, testDsn)[0];

      expect(envelopeHeaders).toBeDefined();
      expect(envelopeHeaders.trace).toBeDefined();
      expect(envelopeHeaders.trace).toEqual(trace);
    });
  });
});

describe('createSpanEnvelope', () => {
  let client: Client | undefined;
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    setAsyncContextStrategy(undefined);
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1, dsn: 'https://username@domain/123' });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  it('creates a span envelope', () => {
    const span = new SentrySpan({
      name: 'test',
      isStandalone: true,
      startTimestamp: 1,
      endTimestamp: 2,
      sampled: true,
      attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom' },
    });

    const spanEnvelope = createSpanEnvelope([span]);

    const spanItem = spanEnvelope[1][0][1];
    expect(spanItem).toEqual({
      data: {
        'sentry.origin': 'manual',
        'sentry.source': 'custom',
      },
      description: 'test',
      is_segment: true,
      origin: 'manual',
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
      segment_id: spanItem.segment_id,
      start_timestamp: 1,
      timestamp: 2,
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
  });

  it('adds `trace` and `sent_at` envelope headers', () => {
    const spanEnvelope = createSpanEnvelope([
      new SentrySpan({ name: 'test', attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom' } }),
    ]);

    const spanEnvelopeHeaders = spanEnvelope[0];
    expect(spanEnvelopeHeaders).toEqual({
      sent_at: expect.any(String),
      trace: {
        environment: 'production',
        public_key: 'username',
        sampled: 'false',
        trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
        transaction: 'test',
      },
    });
  });

  it("doesn't add a `trace` envelope header if there's no public key", () => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1, dsn: 'https://domain/123' });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    const spanEnvelope = createSpanEnvelope([new SentrySpan()]);

    const spanEnvelopeHeaders = spanEnvelope[0];
    expect(spanEnvelopeHeaders).toEqual({
      sent_at: expect.any(String),
    });
  });

  it('calls `beforeSendSpan` and uses original span without any changes', () => {
    const beforeSendSpan = jest.fn(span => span);
    const options = getDefaultTestClientOptions({ dsn: 'https://domain/123', beforeSendSpan });
    const client = new TestClient(options);

    const span = new SentrySpan({
      name: 'test',
      isStandalone: true,
      startTimestamp: 1,
      endTimestamp: 2,
    });

    const spanEnvelope = createSpanEnvelope([span], client);

    expect(beforeSendSpan).toHaveBeenCalled();

    const spanItem = spanEnvelope[1][0][1];
    expect(spanItem).toEqual({
      data: {
        'sentry.origin': 'manual',
      },
      description: 'test',
      is_segment: true,
      origin: 'manual',
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
      segment_id: spanItem.segment_id,
      start_timestamp: 1,
      timestamp: 2,
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
  });

  it('calls `beforeSendSpan` and uses the modified span', () => {
    const beforeSendSpan = jest.fn(span => {
      span.description = `mutated description: ${span.description}`;
      return span;
    });
    const options = getDefaultTestClientOptions({ dsn: 'https://domain/123', beforeSendSpan });
    const client = new TestClient(options);

    const span = new SentrySpan({
      name: 'test',
      isStandalone: true,
      startTimestamp: 1,
      endTimestamp: 2,
    });

    const spanEnvelope = createSpanEnvelope([span], client);

    expect(beforeSendSpan).toHaveBeenCalled();

    const spanItem = spanEnvelope[1][0][1];
    expect(spanItem).toEqual({
      data: {
        'sentry.origin': 'manual',
      },
      description: 'mutated description: test',
      is_segment: true,
      origin: 'manual',
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
      segment_id: spanItem.segment_id,
      start_timestamp: 1,
      timestamp: 2,
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
  });
});
