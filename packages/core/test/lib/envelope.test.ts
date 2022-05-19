import { DsnComponents, Event } from '@sentry/types';

import { createEventEnvelope } from '../../src/envelope';

const testDsn: DsnComponents = { protocol: 'https', projectId: 'abc', host: 'testry.io' };

describe('createEventEnvelope', () => {
  describe('trace header', () => {
    it("doesn't add trace header if event is not a transaction", () => {
      const event: Event = {};
      const envelopeHeaders = createEventEnvelope(event, testDsn)[0];

      expect(envelopeHeaders).toBeDefined();
      expect(envelopeHeaders.trace).toBeUndefined();
    });

    it("doesn't add trace header if no baggage data is available", () => {
      const event: Event = {
        type: 'transaction',
      };
      const envelopeHeaders = createEventEnvelope(event, testDsn)[0];

      expect(envelopeHeaders).toBeDefined();
      expect(envelopeHeaders.trace).toBeUndefined();
    });

    const testTable: Array<[string, Event, Event]> = [
      ['adds only baggage item', { type: 'transaction', release: '1.0.0' }, { release: '1.0.0' }],
      [
        'adds two baggage items',
        { type: 'transaction', release: '1.0.0', environment: 'prod' },
        { release: '1.0.0', environment: 'prod' },
      ],
      [
        'adds all baggageitems',
        {
          type: 'transaction',
          release: '1.0.0',
          environment: 'prod',
          user: { id: 'bob', segment: 'segmentA' },
          transaction: 'TX',
        },
        {
          release: '1.0.0',
          environment: 'prod',
          user: { id: 'bob', segment: 'segmentA' },
          transaction: 'TX',
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
