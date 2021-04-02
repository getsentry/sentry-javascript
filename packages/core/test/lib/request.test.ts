import { Event, SentryRequest, TransactionSamplingMethod } from '@sentry/types';

import { API } from '../../src/api';
import { eventToSentryRequest } from '../../src/request';

describe('eventToSentryRequest', () => {
  function parseEnvelopeRequest(request: SentryRequest): any {
    const [envelopeHeaderString, itemHeaderString, eventString] = request.body.split('\n');

    return {
      envelopeHeader: JSON.parse(envelopeHeaderString),
      itemHeader: JSON.parse(itemHeaderString),
      event: JSON.parse(eventString),
    };
  }

  const api = new API('https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012', {
    sdk: {
      integrations: ['AWSLambda'],
      name: 'sentry.javascript.browser',
      version: `12.31.12`,
      packages: [{ name: 'npm:@sentry/browser', version: `12.31.12` }],
    },
  });

  const eventBase = {
    contexts: { trace: { trace_id: '1231201211212012', span_id: '12261980', op: 'pageload' } },
    environment: 'dogpark',
    event_id: '0908201304152013',
    release: 'off.leash.park',
    user: { id: '1121', username: 'CharlieDog', ip_address: '11.21.20.12', segment: 'bigs' },
  };

  describe('error/message events', () => {
    let errorEvent: Event;

    beforeEach(() => {
      errorEvent = {
        ...eventBase,
        exception: { values: [{ type: 'PuppyProblemsError', value: 'Charlie ate the flip-flops :-(' }] },
      };
    });

    it('adds correct type, url, and event data', () => {
      const result = eventToSentryRequest(errorEvent, api);

      expect(result.type).toEqual('event');
      expect(result.url).toEqual(
        'https://squirrelchasers.ingest.sentry.io/api/12312012/store/?sentry_key=dogsarebadatkeepingsecrets&sentry_version=7',
      );
      expect(result.body).toEqual(JSON.stringify(errorEvent));
    });
  });

  describe('transaction events', () => {
    let transactionEvent: Event;

    beforeEach(() => {
      transactionEvent = {
        ...eventBase,
        debug_meta: {
          transactionSampling: { method: TransactionSamplingMethod.Rate, rate: 0.1121 },
          // This value is hardcoded in its base64 form to avoid a dependency on @sentry/tracing, where the method to
          // compute the value lives. It's equivalent to
          // computeTracestateValue({
          //   trace_id: '1231201211212012',
          //   environment: 'dogpark',
          //   public_key: 'dogsarebadatkeepingsecrets',
          //   release: 'off.leash.park',
          //   user: { id: '1121', segment: 'bigs' },
          // }),
          tracestate: {
            sentry:
              'sentry=eyJ0cmFjZV9pZCI6IjEyMzEyMDEyMTEyMTIwMTIiLCJlbnZpcm9ubWVudCI6ImRvZ3BhcmsiLCJwdWJsaWNfa2V5Ijo' +
              'iZG9nc2FyZWJhZGF0a2VlcGluZ3NlY3JldHMiLCJyZWxlYXNlIjoib2ZmLmxlYXNoLnBhcmsiLCJ1c2VyIjp7ImlkIjoiMTEyM' +
              'SIsInNlZ21lbnQiOiJiaWdzIn19',
          },
        },
        spans: [],
        transaction: '/dogs/are/great/',
        type: 'transaction',
      };
    });

    it('adds correct type, url, and event data', () => {
      const result = eventToSentryRequest(transactionEvent, api);
      const envelope = parseEnvelopeRequest(result);

      expect(result.type).toEqual('transaction');
      expect(result.url).toEqual(
        'https://squirrelchasers.ingest.sentry.io/api/12312012/envelope/?sentry_key=dogsarebadatkeepingsecrets&sentry_version=7',
      );
      expect(envelope.event).toEqual(transactionEvent);
    });

    describe('envelope header', () => {
      it('adds correct entries to envelope header', () => {
        jest.spyOn(Date.prototype, 'toISOString').mockReturnValueOnce('2012-12-31T09:08:13.000Z');

        const result = eventToSentryRequest(transactionEvent, api);
        const envelope = parseEnvelopeRequest(result);

        // the values for `sdk` and `trace` are more complicated and are therefore tested separately
        expect(Object.keys(envelope.envelopeHeader)).toEqual(['event_id', 'sent_at', 'sdk', 'trace']);
        expect(envelope.envelopeHeader.event_id).toEqual('0908201304152013');
        expect(envelope.envelopeHeader.sent_at).toEqual('2012-12-31T09:08:13.000Z');
      });

      describe('sdk info', () => {
        it('adds sdk info to envelope header', () => {
          const result = eventToSentryRequest(transactionEvent, api);
          const envelope = parseEnvelopeRequest(result);

          expect(envelope.envelopeHeader.sdk).toBeDefined();
          expect(envelope.envelopeHeader.sdk).toEqual({ name: 'sentry.javascript.browser', version: '12.31.12' });
        });

        it('adds sdk info to event body', () => {
          const result = eventToSentryRequest(transactionEvent, api);
          const envelope = parseEnvelopeRequest(result);

          expect(envelope.event.sdk).toBeDefined();
          expect(envelope.event.sdk).toEqual({
            integrations: ['AWSLambda'],
            name: 'sentry.javascript.browser',
            version: `12.31.12`,
            packages: [{ name: 'npm:@sentry/browser', version: `12.31.12` }],
          });
        });

        it('merges sdk info if sdk data already exists on the event body', () => {
          transactionEvent.sdk = {
            integrations: ['Ball Fetching'],
            name: 'sentry.dog.tricks',
            packages: [{ name: 'npm:@sentry/dogtricks', version: `11.21.12` }],
            version: '11.21.12',
          };

          const result = eventToSentryRequest(transactionEvent, api);
          const envelope = parseEnvelopeRequest(result);

          expect(envelope.event).toEqual(
            expect.objectContaining({
              sdk: {
                integrations: ['Ball Fetching', 'AWSLambda'],
                name: 'sentry.dog.tricks',
                packages: [
                  { name: 'npm:@sentry/dogtricks', version: `11.21.12` },
                  { name: 'npm:@sentry/browser', version: `12.31.12` },
                ],
                version: '11.21.12',
              },
            }),
          );
        });
      });

      describe('tracestate', () => {
        it('adds tracestate data to envelope header', () => {
          const result = eventToSentryRequest(transactionEvent, api);
          const envelope = parseEnvelopeRequest(result);

          expect(envelope.envelopeHeader.trace).toBeDefined();
          expect(envelope.envelopeHeader.trace).toEqual({
            trace_id: '1231201211212012',
            environment: 'dogpark',
            public_key: 'dogsarebadatkeepingsecrets',
            release: 'off.leash.park',
            user: { id: '1121', segment: 'bigs' },
          });
        });
      });
    });

    describe('item header', () => {
      it('adds correct entries to item header', () => {
        const result = eventToSentryRequest(transactionEvent, api);
        const envelope = parseEnvelopeRequest(result);

        // the value for `sample_rates` is more complicated and is therefore tested separately
        expect(Object.keys(envelope.itemHeader)).toEqual(['type', 'sample_rates']);
        expect(envelope.itemHeader.type).toEqual('transaction');
      });

      describe('transaction sampling info', () => {
        it(`adds transaction sampling information to item header`, () => {
          const result = eventToSentryRequest(transactionEvent, api);
          const envelope = parseEnvelopeRequest(result);

          expect(envelope.itemHeader).toEqual(
            expect.objectContaining({
              sample_rates: [{ id: TransactionSamplingMethod.Rate, rate: 0.1121 }],
            }),
          );
        });

        it('removes transaction sampling information (and only that) from debug_meta', () => {
          (transactionEvent.debug_meta as any).dog = 'Charlie';

          const result = eventToSentryRequest(transactionEvent, api);
          const envelope = parseEnvelopeRequest(result);

          expect('transactionSampling' in envelope.event.debug_meta).toBe(false);
          expect('dog' in envelope.event.debug_meta).toBe(true);
        });

        it('removes debug_meta entirely if it ends up empty', () => {
          const result = eventToSentryRequest(transactionEvent, api);
          const envelope = parseEnvelopeRequest(result);

          expect('debug_meta' in envelope.event).toBe(false);
        });
      });
    });
  });
});
