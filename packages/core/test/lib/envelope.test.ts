import type { DsnComponents, DynamicSamplingContext, Event } from '@sentry/types';

import { createEventEnvelope, createUserFeedbackEnvelope } from '../../src/envelope';

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

describe('createUserFeedbackEnvelope', () => {
  test('creates user feedback envelope header', () => {
    const envelope = createUserFeedbackEnvelope(
      {
        comments: 'Test Comments',
        email: 'test@email.com',
        name: 'Test User',
        event_id: 'testEvent123',
      },
      {
        host: 'testHost',
        projectId: 'testProjectId',
        protocol: 'http',
      },
      {
        sdk: {
          name: 'testSdkName',
          version: 'testSdkVersion',
        },
      },
      'testTunnel',
    );

    expect(envelope[0]).toEqual({
      dsn: 'http://undefined@testHost/undefinedtestProjectId',
      event_id: 'testEvent123',
      sdk: {
        name: 'testSdkName',
        version: 'testSdkVersion',
      },
      sent_at: expect.any(String),
    });
  });

  test('creates user feedback envelope item', () => {
    const envelope = createUserFeedbackEnvelope(
      {
        comments: 'Test Comments',
        email: 'test@email.com',
        name: 'Test User',
        event_id: 'testEvent123',
      }
    );

    expect(envelope[1]).toEqual([
      [
        {
          type: 'user_report',
        },
        {
          comments: 'Test Comments',
          email: 'test@email.com',
          name: 'Test User',
          event_id: 'testEvent123',
        },
      ],
    ]);
  });
});
