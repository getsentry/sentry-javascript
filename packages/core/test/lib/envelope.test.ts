import { DsnComponents, Event, EventTraceContext } from '@sentry/types';

import { createEventEnvelope } from '../../src/envelope';

const testDsn: DsnComponents = { protocol: 'https', projectId: 'abc', host: 'testry.io', publicKey: 'pubKey123' };

describe('createEventEnvelope', () => {
  describe('trace header', () => {
    it("doesn't add trace header if event is not a transaction", () => {
      const event: Event = {};
      const envelopeHeaders = createEventEnvelope(event, testDsn)[0];

      expect(envelopeHeaders).toBeDefined();
      expect(envelopeHeaders.trace).toBeUndefined();
    });

    const testTable: Array<[string, Event, EventTraceContext]> = [
      [
        'adds minimal baggage items',
        {
          type: 'transaction',
          sdkProcessingMetadata: {
            baggage: [{ traceid: '1234', publickey: 'pubKey123' }, '', false],
          },
        },
        { trace_id: '1234', public_key: 'pubKey123' },
      ],
      [
        'adds multiple baggage items',
        {
          type: 'transaction',
          sdkProcessingMetadata: {
            baggage: [{ environment: 'prod', release: '1.0.0', publickey: 'pubKey123', traceid: '1234' }, '', false],
          },
        },
        { release: '1.0.0', environment: 'prod', trace_id: '1234', public_key: 'pubKey123' },
      ],
      [
        'adds all baggage items',
        {
          type: 'transaction',
          sdkProcessingMetadata: {
            baggage: [
              {
                environment: 'prod',
                release: '1.0.0',
                userid: 'bob',
                usersegment: 'segmentA',
                transaction: 'TX',
                samplerate: '0.95',
                publickey: 'pubKey123',
                traceid: '1234',
              },
              '',
              false,
            ],
          },
        },
        {
          release: '1.0.0',
          environment: 'prod',
          user: { id: 'bob', segment: 'segmentA' },
          transaction: 'TX',
          trace_id: '1234',
          public_key: 'pubKey123',
          sample_rate: '0.95',
        },
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
