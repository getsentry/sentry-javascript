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

    it('adds minimal trace data if event is a transaction and no other baggage-related data is available', () => {
      const event: Event = {
        type: 'transaction',
        contexts: {
          trace: {
            trace_id: '1234',
          },
        },
      };
      const envelopeHeaders = createEventEnvelope(event, testDsn)[0];

      expect(envelopeHeaders).toBeDefined();
      expect(envelopeHeaders.trace).toEqual({ trace_id: '1234', public_key: 'pubKey123' });
    });

    const testTable: Array<[string, Event, EventTraceContext]> = [
      [
        'adds only baggage item',
        {
          type: 'transaction',
          release: '1.0.0',
          contexts: {
            trace: {
              trace_id: '1234',
            },
          },
        },
        { release: '1.0.0', trace_id: '1234', public_key: 'pubKey123' },
      ],
      [
        'adds two baggage items',
        {
          type: 'transaction',
          release: '1.0.0',
          environment: 'prod',
          contexts: {
            trace: {
              trace_id: '1234',
            },
          },
        },
        { release: '1.0.0', environment: 'prod', trace_id: '1234', public_key: 'pubKey123' },
      ],
      [
        'adds all baggageitems',
        {
          type: 'transaction',
          release: '1.0.0',
          environment: 'prod',
          user: { id: 'bob', segment: 'segmentA' },
          transaction: 'TX',
          contexts: {
            trace: {
              trace_id: '1234',
            },
          },
        },
        {
          release: '1.0.0',
          environment: 'prod',
          user: { id: 'bob', segment: 'segmentA' },
          transaction: 'TX',
          trace_id: '1234',
          public_key: 'pubKey123',
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
