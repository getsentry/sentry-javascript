import { Event } from '@sentry/types';

import { API } from '../../src/api';
import { eventToSentryRequest } from '../../src/request';

describe('eventToSentryRequest', () => {
  const api = new API('https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012');

  it('correctly handles error/message events', () => {
    const event = {
      event_id: '1231201211212012',
      exception: { values: [{ type: 'PuppyProblemsError', value: 'Charlie ate the flip-flops :-(' }] },
      user: { id: '1121', username: 'CharlieDog', ip_address: '11.21.20.12' },
    };

    const result = eventToSentryRequest(event, api);
    expect(result.type).toEqual('event');
    expect(result.url).toEqual(
      'https://squirrelchasers.ingest.sentry.io/api/12312012/store/?sentry_key=dogsarebadatkeepingsecrets&sentry_version=7',
    );
    expect(result.body).toEqual(JSON.stringify(event));
  });

  it('correctly handles transaction events', () => {
    const eventId = '1231201211212012';
    const traceId = '0908201304152013';
    const event = {
      contexts: { trace: { trace_id: traceId, span_id: '12261980', op: 'pageload' } },
      event_id: eventId,
      release: 'off.leash.park',
      spans: [],
      transaction: '/dogs/are/great/',
      type: 'transaction',
      user: { id: '1121', username: 'CharlieDog', ip_address: '11.21.20.12' },
    };

    const result = eventToSentryRequest(event as Event, api);

    const [envelopeHeaderString, itemHeaderString, eventString] = result.body.split('\n');

    const envelope = {
      envelopeHeader: JSON.parse(envelopeHeaderString),
      itemHeader: JSON.parse(itemHeaderString),
      event: JSON.parse(eventString),
    };

    expect(result.type).toEqual('transaction');
    expect(result.url).toEqual(
      'https://squirrelchasers.ingest.sentry.io/api/12312012/envelope/?sentry_key=dogsarebadatkeepingsecrets&sentry_version=7',
    );
    expect(envelope.envelopeHeader).toEqual({
      event_id: eventId,
      sent_at: expect.any(String),
      trace: { public_key: 'dogsarebadatkeepingsecrets', release: 'off.leash.park', trace_id: traceId },
    });
    expect(envelope.itemHeader).toEqual({ type: 'transaction' });
    expect(envelope.event).toEqual(event);
  });
});
