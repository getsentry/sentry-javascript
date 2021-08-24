import * as sentryCore from '@sentry/core';
import { API } from '@sentry/core';
import { Hub } from '@sentry/hub';
import { SentryRequest } from '@sentry/types';
import * as utilsPackage from '@sentry/utils';
import { base64ToUnicode } from '@sentry/utils';

import { Span } from '../src/span';
import { Transaction } from '../src/transaction';
import { computeTracestateValue } from '../src/utils';

// TODO gather sentry-trace and tracestate tests here

function parseEnvelopeRequest(request: SentryRequest): any {
  const [envelopeHeaderString, itemHeaderString, eventString] = request.body.split('\n');

  return {
    envelopeHeader: JSON.parse(envelopeHeaderString),
    itemHeader: JSON.parse(itemHeaderString),
    event: JSON.parse(eventString),
  };
}

describe('sentry-trace', () => {
  // TODO gather relevant tests here
});

describe('tracestate', () => {
  // grab these this way rather than importing them individually to get around TS's guards against instantiating
  // abstract classes (using non-abstract classes would create a circular dependency)
  const { BaseClient, BaseBackend } = sentryCore as any;

  const dsn = 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012';
  const environment = 'dogpark';
  const release = 'off.leash.trail';
  const hub = new Hub(
    new BaseClient(BaseBackend, {
      dsn,
      environment,
      release,
    }),
  );

  describe('sentry tracestate', () => {
    describe('lazy creation', () => {
      const getNewTracestate = jest
        .spyOn(Span.prototype as any, '_getNewTracestate')
        .mockReturnValue('sentry=doGsaREgReaT');

      beforeEach(() => {
        jest.clearAllMocks();
      });

      afterAll(() => {
        jest.restoreAllMocks();
      });

      describe('when creating a transaction', () => {
        it('uses sentry tracestate passed to the transaction constructor rather than creating a new one', () => {
          const transaction = new Transaction({
            name: 'FETCH /ball',
            metadata: { tracestate: { sentry: 'sentry=doGsaREgReaT' } },
          });

          expect(getNewTracestate).not.toHaveBeenCalled();
          expect(transaction.metadata.tracestate?.sentry).toEqual('sentry=doGsaREgReaT');
        });

        it("doesn't create new sentry tracestate on transaction creation if none provided", () => {
          const transaction = new Transaction({
            name: 'FETCH /ball',
          });

          expect(transaction.metadata.tracestate?.sentry).toBeUndefined();
          expect(getNewTracestate).not.toHaveBeenCalled();
        });
      });

      describe('when getting outgoing request headers', () => {
        it('uses existing sentry tracestate when getting tracing headers rather than creating new one', () => {
          const transaction = new Transaction({
            name: 'FETCH /ball',
            metadata: { tracestate: { sentry: 'sentry=doGsaREgReaT' } },
          });

          expect(transaction.getTraceHeaders().tracestate).toEqual('sentry=doGsaREgReaT');
          expect(getNewTracestate).not.toHaveBeenCalled();
        });

        it('creates and stores new sentry tracestate when getting tracing headers if none exists', () => {
          const transaction = new Transaction({
            name: 'FETCH /ball',
          });

          expect(transaction.metadata.tracestate?.sentry).toBeUndefined();

          transaction.getTraceHeaders();

          expect(getNewTracestate).toHaveBeenCalled();
          expect(transaction.metadata.tracestate?.sentry).toEqual('sentry=doGsaREgReaT');
          expect(transaction.getTraceHeaders().tracestate).toEqual('sentry=doGsaREgReaT');
        });
      });

      describe('when getting envelope headers', () => {
        // In real life, `transaction.finish()` calls `captureEvent()`, which eventually calls `eventToSentryRequest()`,
        // which in turn calls `base64ToUnicode`. Here we're short circuiting that process a little, to avoid having to
        // mock out more of the intermediate pieces.
        jest
          .spyOn(utilsPackage, 'base64ToUnicode')
          .mockImplementation(base64 =>
            base64 === 'doGsaREgReaT' ? '{"all the":"right stuff here"}' : '{"nope nope nope":"wrong"}',
          );
        jest.spyOn(hub, 'captureEvent').mockImplementation(event => {
          expect(event).toEqual(
            expect.objectContaining({ debug_meta: { tracestate: { sentry: 'sentry=doGsaREgReaT' } } }),
          );

          const envelope = parseEnvelopeRequest(sentryCore.eventToSentryRequest(event, new API(dsn)));
          expect(envelope.envelopeHeader).toEqual(
            expect.objectContaining({ trace: { 'all the': 'right stuff here' } }),
          );

          // `captureEvent` normally returns the event id
          return '11212012041520131231201209082013'; //
        });

        it('uses existing sentry tracestate in envelope headers rather than creating a new one', () => {
          // one here, and two inside the `captureEvent` implementation above
          expect.assertions(3);

          const transaction = new Transaction(
            {
              name: 'FETCH /ball',
              metadata: { tracestate: { sentry: 'sentry=doGsaREgReaT' } },
              sampled: true,
            },
            hub,
          );

          transaction.finish();

          expect(getNewTracestate).not.toHaveBeenCalled();
        });

        it('creates new sentry tracestate for envelope header if none exists', () => {
          // two here, and two inside the `captureEvent` implementation above
          expect.assertions(4);

          const transaction = new Transaction(
            {
              name: 'FETCH /ball',
              sampled: true,
            },
            hub,
          );

          expect(transaction.metadata.tracestate?.sentry).toBeUndefined();

          transaction.finish();

          expect(getNewTracestate).toHaveBeenCalled();
        });
      });
    });

    describe('mutibility', () => {
      it("won't include data set after transaction is created if there's an inherited value", () => {
        expect.assertions(1);

        const inheritedTracestate = `sentry=${computeTracestateValue({
          trace_id: '12312012090820131231201209082013',
          environment: 'dogpark',
          release: 'off.leash.trail',
          public_key: 'dogsarebadatkeepingsecrets',
        })}`;

        const transaction = new Transaction(
          {
            name: 'FETCH /ball',
            metadata: {
              tracestate: {
                sentry: inheritedTracestate,
              },
            },
          },
          hub,
        );

        hub.withScope(scope => {
          scope.setUser({ id: '1121', username: 'CharlieDog', ip_address: '11.21.20.12', segment: 'bigs' });

          const tracestateValue = (transaction as any)._toTracestate().replace('sentry=', '');
          const reinflatedTracestate = JSON.parse(base64ToUnicode(tracestateValue));

          expect(reinflatedTracestate.user).toBeUndefined();
        });
      });

      it("will include data set after transaction is created if there's no inherited value and `getTraceHeaders` hasn't been called", () => {
        expect.assertions(2);

        const transaction = new Transaction(
          {
            name: 'FETCH /ball',
          },
          hub,
        );

        hub.withScope(scope => {
          scope.setUser({ id: '1121', username: 'CharlieDog', ip_address: '11.21.20.12', segment: 'bigs' });

          const tracestateValue = (transaction as any)._toTracestate().replace('sentry=', '');
          const reinflatedTracestate = JSON.parse(base64ToUnicode(tracestateValue));

          expect(reinflatedTracestate.user.id).toEqual('1121');
          expect(reinflatedTracestate.user.segment).toEqual('bigs');
        });
      });

      it("won't include data set after first call to `getTraceHeaders`", () => {
        expect.assertions(1);

        const transaction = new Transaction(
          {
            name: 'FETCH /ball',
          },
          hub,
        );

        transaction.getTraceHeaders();

        hub.withScope(scope => {
          scope.setUser({ id: '1121', username: 'CharlieDog', ip_address: '11.21.20.12', segment: 'bigs' });

          const tracestateValue = (transaction as any)._toTracestate().replace('sentry=', '');
          const reinflatedTracestate = JSON.parse(base64ToUnicode(tracestateValue));

          expect(reinflatedTracestate.user).toBeUndefined();
        });
      });
    });
  });

  describe('third-party tracestate', () => {
    // TODO gather relevant tests here
  });
});
