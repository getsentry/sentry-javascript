import { createEventEnvelope } from '../../src/envelope';
import { DsnComponents, Event } from '@sentry/types';

const testDsn: DsnComponents = { protocol: 'https', projectId: 'abc', host: 'testry.io' };

describe('createEventEnvelope', () => {
  describe('baggage header', () => {
    it(`doesn't add baggage header if event is not a transaction`, () => {
      const event: Event = {};
      const envelopeHeaders = createEventEnvelope(event, testDsn)[0];

      expect(envelopeHeaders).toBeDefined();
      expect(envelopeHeaders.baggage).toBeUndefined();
    });

    it(`doesn't add baggage header if no baggage data is available`, () => {
      const event: Event = {
        type: 'transaction',
      };
      const envelopeHeaders = createEventEnvelope(event, testDsn)[0];

      expect(envelopeHeaders).toBeDefined();
      expect(envelopeHeaders.baggage).toBeUndefined();
    });

    const testTable: Array<[string, Event, string]> = [
      ['adds only baggage item', { type: 'transaction', release: '1.0.0' }, 'sentry-release=1.0.0'],
      [
        'adds two baggage items',
        { type: 'transaction', release: '1.0.0', environment: 'prod' },
        'sentry-environment=prod,sentry-release=1.0.0',
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
        'sentry-environment=prod,sentry-release=1.0.0,sentry-transaction=TX,sentry-userid=bob,sentry-usersegment=segmentA',
      ],
    ];
    it.each(testTable)('%s', (_: string, event, serializedBaggage) => {
      const envelopeHeaders = createEventEnvelope(event, testDsn)[0];

      expect(envelopeHeaders).toBeDefined();
      expect(envelopeHeaders.baggage).toBeDefined();
      expect(envelopeHeaders.baggage).toEqual(serializedBaggage);
    });
  });
});
