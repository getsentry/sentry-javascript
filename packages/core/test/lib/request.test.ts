import { Event, TransactionSamplingMethod } from '@sentry/types';

import { API } from '../../src/api';
import { eventToSentryRequest } from '../../src/request';

describe('eventToSentryRequest', () => {
  const api = new API('https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012');
  const event: Event = {
    contexts: { trace: { trace_id: '1231201211212012', span_id: '12261980', op: 'pageload' } },
    environment: 'dogpark',
    event_id: '0908201304152013',
    release: 'off.leash.park',
    spans: [],
    transaction: '/dogs/are/great/',
    type: 'transaction',
    user: { id: '1121', username: 'CharlieDog', ip_address: '11.21.20.12' },
  };

  [
    { method: TransactionSamplingMethod.Rate, rate: '0.1121', dog: 'Charlie' },
    { method: TransactionSamplingMethod.Sampler, rate: '0.1231', dog: 'Maisey' },
    { method: TransactionSamplingMethod.Inheritance, dog: 'Cory' },
    { method: TransactionSamplingMethod.Explicit, dog: 'Bodhi' },

    // this shouldn't ever happen (at least the method should always be included in tags), but good to know that things
    // won't blow up if it does
    { dog: 'Lucy' },
  ].forEach(({ method, rate, dog }) => {
    it(`adds transaction sampling information to item header - ${method}, ${rate}, ${dog}`, () => {
      // TODO kmclb - once tag types are loosened, don't need to cast to string here
      event.tags = { __sentry_samplingMethod: String(method), __sentry_sampleRate: String(rate), dog };

      const result = eventToSentryRequest(event as Event, api);

      const [envelopeHeaderString, itemHeaderString, eventString] = result.body.split('\n');

      const envelope = {
        envelopeHeader: JSON.parse(envelopeHeaderString),
        itemHeader: JSON.parse(itemHeaderString),
        event: JSON.parse(eventString),
      };

      // the right stuff is added to the item header
      expect(envelope.itemHeader).toEqual({
        type: 'transaction',
        // TODO kmclb - once tag types are loosened, don't need to cast to string here
        sample_rates: [{ id: String(method), rate: String(rate) }],
      });

      // show that it pops the right tags and leaves the rest alone
      expect('__sentry_samplingMethod' in envelope.event.tags).toBe(false);
      expect('__sentry_sampleRate' in envelope.event.tags).toBe(false);
      expect('dog' in envelope.event.tags).toBe(true);
    });
  });
});
