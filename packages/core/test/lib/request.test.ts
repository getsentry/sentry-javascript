import { Event } from '@sentry/types';

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

  it('adds sampling information to transaction item header', () => {
    event.tags = { __sentry_samplingMethod: 'client_rate', __sentry_sampleRate: '0.1121', dog: 'Charlie' };

    const result = eventToSentryRequest(event as Event, api);

    const [envelopeHeaderString, itemHeaderString, eventString] = result.body.split('\n');

    const envelope = {
      envelopeHeader: JSON.parse(envelopeHeaderString),
      itemHeader: JSON.parse(itemHeaderString),
      event: JSON.parse(eventString),
    };

    // the right stuff is added to the item header
    expect(envelope.itemHeader).toEqual({ type: 'transaction', sample_rates: [{ id: 'client_rate', rate: '0.1121' }] });

    // show that it pops the right tags and leaves the rest alone
    expect('__sentry_samplingMethod' in envelope.event.tags).toBe(false);
    expect('__sentry_sampleRate' in envelope.event.tags).toBe(false);
    expect('dog' in envelope.event.tags).toBe(true);
  });
});
