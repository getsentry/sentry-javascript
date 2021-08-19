import { Event, SentryRequest, Session, TransactionSamplingMethod } from '@sentry/types';

import { API } from '../../src/api';
import { eventToSentryRequest, sessionToSentryRequest } from '../../src/request';

const timestamp = '2012-12-31T09:08:13.000Z';
jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(timestamp);

const squirrelChasersDSN = 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012';
const storeUrl =
  'https://squirrelchasers.ingest.sentry.io/api/12312012/store/?sentry_key=dogsarebadatkeepingsecrets&sentry_version=7';
const envelopeUrl =
  'https://squirrelchasers.ingest.sentry.io/api/12312012/envelope/?sentry_key=dogsarebadatkeepingsecrets&sentry_version=7';
const tunnelUrl = 'https://sit.stay.rollover/good/dog/';

const sdkInfo = {
  integrations: ['AWSLambda'],
  name: 'sentry.javascript.browser',
  version: `12.31.12`,
  packages: [{ name: 'npm:@sentry/browser', version: `12.31.12` }],
};

const api = new API(squirrelChasersDSN, {
  sdk: sdkInfo,
});

function parseEnvelopeRequest(request: SentryRequest): any {
  const [envelopeHeaderString, itemHeaderString, eventString] = request.body.split('\n');

  return {
    envelopeHeader: JSON.parse(envelopeHeaderString),
    itemHeader: JSON.parse(itemHeaderString),
    event: JSON.parse(eventString),
  };
}

describe('eventToSentryRequest', () => {
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
      expect(result.url).toEqual(storeUrl);
      expect(result.body).toEqual(JSON.stringify(errorEvent));
    });

    it('uses an envelope if a tunnel is configured', () => {
      const result = eventToSentryRequest(errorEvent, new API(squirrelChasersDSN, {}, tunnelUrl));

      expect(() => {
        // this will barf if the request body isn't of the form "<bunch-of-JSON>\n<bunch-of-JSON>\n<bunch-of-JSON>"
        parseEnvelopeRequest(result);
      }).not.toThrowError();
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
      expect(result.url).toEqual(envelopeUrl);
      expect(envelope.event).toEqual(transactionEvent);
    });

    describe('envelope header', () => {
      it('adds correct entries to envelope header', () => {
        const result = eventToSentryRequest(transactionEvent, api);
        const envelope = parseEnvelopeRequest(result);

        expect(envelope.envelopeHeader).toEqual({
          event_id: eventBase.event_id,
          sent_at: timestamp,
          sdk: { name: 'sentry.javascript.browser', version: '12.31.12' },
          // the value for `trace` is tested separately
          trace: expect.any(Object),
        });
      });

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

    describe('item header', () => {
      it('adds correct entries to item header', () => {
        const result = eventToSentryRequest(transactionEvent, api);
        const envelope = parseEnvelopeRequest(result);

        expect(envelope.itemHeader).toEqual({
          type: 'transaction',
          // the value for `sample_rates` is tested separately
          sample_rates: expect.any(Object),
        });
      });

      it('adds transaction sampling information to item header', () => {
        const result = eventToSentryRequest(transactionEvent, api);
        const envelope = parseEnvelopeRequest(result);

        expect(envelope.itemHeader).toEqual(
          expect.objectContaining({
            sample_rates: [{ id: TransactionSamplingMethod.Rate, rate: 0.1121 }],
          }),
        );
      });
    });

    describe('debug_meta', () => {
      it('removes transaction sampling and tracestate information from debug_meta', () => {
        (transactionEvent.debug_meta as any).dog = 'Charlie';

        const result = eventToSentryRequest(transactionEvent, api);
        const envelope = parseEnvelopeRequest(result);

        expect('transactionSampling' in envelope.event.debug_meta).toBe(false);
        expect('tracestate' in envelope.event.debug_meta).toBe(false);
        expect('dog' in envelope.event.debug_meta).toBe(true);
      });

      it('removes debug_meta entirely if it ends up empty', () => {
        const result = eventToSentryRequest(transactionEvent, api);
        const envelope = parseEnvelopeRequest(result);

        expect('debug_meta' in envelope.event).toBe(false);
      });
    });
  });

  describe('SDK metadata', () => {
    it('adds sdk info to event body', () => {
      const event = { ...eventBase };
      const result = eventToSentryRequest(event, api);

      expect(JSON.parse(result.body).sdk).toEqual(sdkInfo);
    });

    it('merges sdk info if sdk data already exists on the event body', () => {
      const event = {
        ...eventBase,
        sdk: {
          integrations: ['Ball Fetching'],
          name: 'sentry.dog.tricks',
          packages: [{ name: 'npm:@sentry/dogtricks', version: `11.21.12` }],
          version: '11.21.12',
        },
      };

      const result = eventToSentryRequest(event, api);

      expect(JSON.parse(result.body).sdk).toEqual({
        integrations: ['Ball Fetching', 'AWSLambda'],
        name: 'sentry.dog.tricks',
        packages: [
          { name: 'npm:@sentry/dogtricks', version: `11.21.12` },
          { name: 'npm:@sentry/browser', version: `12.31.12` },
        ],
        version: '11.21.12',
      });
    });
  });

  describe('using a tunnel', () => {
    let event: Event;

    beforeEach(() => {
      event = { ...eventBase };
    });

    it('uses the tunnel URL', () => {
      const tunnelRequest = eventToSentryRequest(event, new API(squirrelChasersDSN, {}, tunnelUrl));
      expect(tunnelRequest.url).toEqual(tunnelUrl);
    });

    it('adds dsn to envelope header', () => {
      const result = eventToSentryRequest(event, new API(squirrelChasersDSN, {}, tunnelUrl));
      const envelope = parseEnvelopeRequest(result);

      expect(envelope.envelopeHeader).toEqual(
        expect.objectContaining({
          dsn: squirrelChasersDSN,
        }),
      );
    });

    it('defaults `type` to "event" in item header if `type` missing from event', () => {
      const result = eventToSentryRequest(event, new API(squirrelChasersDSN, {}, tunnelUrl));
      const envelope = parseEnvelopeRequest(result);

      expect(envelope.itemHeader).toEqual(
        expect.objectContaining({
          type: 'event',
        }),
      );
    });

    it('uses `type` value from event in item header if present', () => {
      // this is obviously not a valid event type, but the only valid one is "transaction", and that requires a whole
      // bunch of metadata which is beside the point here
      (event as any).type = 'dogEvent';

      const result = eventToSentryRequest(event, new API(squirrelChasersDSN, {}, tunnelUrl));
      const envelope = parseEnvelopeRequest(result);

      expect(envelope.itemHeader).toEqual(
        expect.objectContaining({
          type: 'dogEvent',
        }),
      );
    });
  });
});

describe('sessionToSentryRequest', () => {
  //   { "sent_at": "2021-08-19T20:47:04.474Z", "sdk": { "name": "sentry.javascript.browser", "version": "6.11.0" } }
  // {"type":"session"}
  const sessionEvent = ({
    sid: '0908201304152013',
    init: true,
    started: timestamp,
    timestamp,
    status: 'ok',
    errors: 0,
    attrs: {
      release: 'off.leash.park',
      environment: 'dogpark',
    },
  } as unknown) as Session;

  const sessionAggregatesEvent = {
    attrs: { release: 'off.leash.park', environment: 'dogpark' },
    aggregates: [{ started: timestamp, exited: 2 }],
  };

  it('adds correct type, url, and event data to session events', () => {
    const result = sessionToSentryRequest(sessionEvent, api);
    const envelope = parseEnvelopeRequest(result);

    expect(result.type).toEqual('session');
    expect(result.url).toEqual(envelopeUrl);
    expect(envelope.event).toEqual(sessionEvent);
  });

  it('adds correct type, url, and event data to session aggregates events', () => {
    const result = sessionToSentryRequest(sessionAggregatesEvent, api);
    const envelope = parseEnvelopeRequest(result);

    expect(result.type).toEqual('sessions');
    expect(result.url).toEqual(envelopeUrl);
    expect(envelope.event).toEqual(sessionAggregatesEvent);
  });

  it('adds correct entries to envelope header', () => {
    const result = sessionToSentryRequest(sessionEvent, api);
    const envelope = parseEnvelopeRequest(result);

    expect(envelope.envelopeHeader).toEqual({
      sent_at: timestamp,
      sdk: { name: 'sentry.javascript.browser', version: '12.31.12' },
    });
  });

  it('adds correct entries to item header', () => {
    const result = sessionToSentryRequest(sessionEvent, api);
    const envelope = parseEnvelopeRequest(result);

    expect(envelope.itemHeader).toEqual({
      type: 'session',
    });
  });

  describe('using a tunnel', () => {
    it('uses the tunnel URL', () => {
      const tunnelRequest = sessionToSentryRequest(sessionEvent, new API(squirrelChasersDSN, {}, tunnelUrl));
      expect(tunnelRequest.url).toEqual(tunnelUrl);
    });

    it('adds dsn to envelope header', () => {
      const result = sessionToSentryRequest(sessionEvent, new API(squirrelChasersDSN, {}, tunnelUrl));
      const envelope = parseEnvelopeRequest(result);

      expect(envelope.envelopeHeader).toEqual(
        expect.objectContaining({
          dsn: squirrelChasersDSN,
        }),
      );
    });
  });
});
