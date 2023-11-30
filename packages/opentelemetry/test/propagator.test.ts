import {
  ROOT_CONTEXT,
  TraceFlags,
  defaultTextMapGetter,
  defaultTextMapSetter,
  propagation,
  trace,
} from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { Hub, addTracingExtensions, makeMain } from '@sentry/core';
import type { PropagationContext } from '@sentry/types';

import { SENTRY_BAGGAGE_HEADER, SENTRY_TRACE_HEADER } from '../src/constants';
import { SentryPropagator } from '../src/propagator';
import { getPropagationContextFromContext, setPropagationContextOnContext } from '../src/utils/contextData';

beforeAll(() => {
  addTracingExtensions();
});

describe('SentryPropagator', () => {
  const propagator = new SentryPropagator();
  let carrier: { [key: string]: unknown };

  beforeEach(() => {
    carrier = {};
  });

  it('returns fields set', () => {
    expect(propagator.fields()).toEqual([SENTRY_TRACE_HEADER, SENTRY_BAGGAGE_HEADER]);
  });

  describe('inject', () => {
    const client = {
      getOptions: () => ({
        environment: 'production',
        release: '1.0.0',
      }),
      getDsn: () => ({
        publicKey: 'abc',
      }),
    };
    // @ts-expect-error Use mock client for unit tests
    const hub: Hub = new Hub(client);
    makeMain(hub);

    describe('with active span', () => {
      it.each([
        [
          'works with a sampled propagation context',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.SAMPLED,
          },
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c94',
            parentSpanId: '6e0c63257de34c93',
            sampled: true,
            dsc: {
              transaction: 'sampled-transaction',
              trace_id: 'd4cda95b652f4a1592b449d5929fda1b',
              sampled: 'true',
              public_key: 'abc',
              environment: 'production',
              release: '1.0.0',
            },
          },
          [
            'sentry-environment=production',
            'sentry-release=1.0.0',
            'sentry-public_key=abc',
            'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
            'sentry-transaction=sampled-transaction',
            'sentry-sampled=true',
          ],
          'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-1',
        ],
        [
          'works with an unsampled propagation context',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.NONE,
          },
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c94',
            parentSpanId: '6e0c63257de34c93',
            sampled: false,
            dsc: {
              transaction: 'not-sampled-transaction',
              trace_id: 'd4cda95b652f4a1592b449d5929fda1b',
              sampled: 'false',
              public_key: 'abc',
              environment: 'production',
              release: '1.0.0',
            },
          },
          [
            'sentry-environment=production',
            'sentry-release=1.0.0',
            'sentry-public_key=abc',
            'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
            'sentry-transaction=not-sampled-transaction',
            'sentry-sampled=false',
          ],
          'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-0',
        ],
        [
          'creates a new DSC if none exists yet',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.SAMPLED,
          },
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c94',
            parentSpanId: '6e0c63257de34c93',
            sampled: true,
            dsc: undefined,
          },
          [
            'sentry-environment=production',
            'sentry-public_key=abc',
            'sentry-release=1.0.0',
            'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
          ],
          'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-1',
        ],
        [
          'works with a remote parent span',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.SAMPLED,
            isRemote: true,
          },
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c94',
            parentSpanId: '6e0c63257de34c93',
            sampled: true,
            dsc: {
              transaction: 'sampled-transaction',
              trace_id: 'd4cda95b652f4a1592b449d5929fda1b',
              sampled: 'true',
              public_key: 'abc',
              environment: 'production',
              release: '1.0.0',
            },
          },
          [
            'sentry-environment=production',
            'sentry-release=1.0.0',
            'sentry-public_key=abc',
            'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
            'sentry-transaction=sampled-transaction',
            'sentry-sampled=true',
          ],
          'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c94-1',
        ],
      ])('%s', (_name, spanContext, propagationContext, baggage, sentryTrace) => {
        const context = trace.setSpanContext(
          setPropagationContextOnContext(ROOT_CONTEXT, propagationContext),
          spanContext,
        );
        propagator.inject(context, carrier, defaultTextMapSetter);
        expect(baggageToArray(carrier[SENTRY_BAGGAGE_HEADER])).toEqual(baggage.sort());
        expect(carrier[SENTRY_TRACE_HEADER]).toBe(sentryTrace);
      });

      it('should include existing baggage', () => {
        const propagationContext: PropagationContext = {
          traceId: 'd4cda95b652f4a1592b449d5929fda1b',
          spanId: '6e0c63257de34c92',
          parentSpanId: '6e0c63257de34c93',
          sampled: true,
          dsc: {
            transaction: 'sampled-transaction',
            trace_id: 'd4cda95b652f4a1592b449d5929fda1b',
            sampled: 'true',
            public_key: 'abc',
            environment: 'production',
            release: '1.0.0',
          },
        };

        const spanContext = {
          traceId: 'd4cda95b652f4a1592b449d5929fda1b',
          spanId: '6e0c63257de34c92',
          traceFlags: TraceFlags.SAMPLED,
        };
        const context = trace.setSpanContext(
          setPropagationContextOnContext(ROOT_CONTEXT, propagationContext),
          spanContext,
        );
        const baggage = propagation.createBaggage({ foo: { value: 'bar' } });
        propagator.inject(propagation.setBaggage(context, baggage), carrier, defaultTextMapSetter);
        expect(baggageToArray(carrier[SENTRY_BAGGAGE_HEADER])).toEqual(
          [
            'foo=bar',
            'sentry-transaction=sampled-transaction',
            'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
            'sentry-sampled=true',
            'sentry-public_key=abc',
            'sentry-environment=production',
            'sentry-release=1.0.0',
          ].sort(),
        );
      });

      it('should create baggage without propagation context', () => {
        const spanContext = {
          traceId: 'd4cda95b652f4a1592b449d5929fda1b',
          spanId: '6e0c63257de34c92',
          traceFlags: TraceFlags.SAMPLED,
        };
        const context = trace.setSpanContext(ROOT_CONTEXT, spanContext);
        const baggage = propagation.createBaggage({ foo: { value: 'bar' } });
        propagator.inject(propagation.setBaggage(context, baggage), carrier, defaultTextMapSetter);
        expect(carrier[SENTRY_BAGGAGE_HEADER]).toBe('foo=bar');
      });

      it('should NOT set baggage and sentry-trace header if instrumentation is supressed', () => {
        const spanContext = {
          traceId: 'd4cda95b652f4a1592b449d5929fda1b',
          spanId: '6e0c63257de34c92',
          traceFlags: TraceFlags.SAMPLED,
        };
        const propagationContext: PropagationContext = {
          traceId: 'd4cda95b652f4a1592b449d5929fda1b',
          spanId: '6e0c63257de34c92',
          parentSpanId: '6e0c63257de34c93',
          sampled: true,
          dsc: {
            transaction: 'sampled-transaction',
            trace_id: 'd4cda95b652f4a1592b449d5929fda1b',
            sampled: 'true',
            public_key: 'abc',
            environment: 'production',
            release: '1.0.0',
          },
        };
        const context = suppressTracing(
          trace.setSpanContext(setPropagationContextOnContext(ROOT_CONTEXT, propagationContext), spanContext),
        );
        propagator.inject(context, carrier, defaultTextMapSetter);
        expect(carrier[SENTRY_TRACE_HEADER]).toBe(undefined);
        expect(carrier[SENTRY_BAGGAGE_HEADER]).toBe(undefined);
      });
    });

    it('should take span from propagationContext id if no active span is found', () => {
      const propagationContext: PropagationContext = {
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        parentSpanId: '6e0c63257de34c93',
        spanId: '6e0c63257de34c92',
        sampled: true,
        dsc: {
          transaction: 'sampled-transaction',
          trace_id: 'd4cda95b652f4a1592b449d5929fda1b',
          sampled: 'true',
          public_key: 'abc',
          environment: 'production',
          release: '1.0.0',
        },
      };

      const context = setPropagationContextOnContext(ROOT_CONTEXT, propagationContext);
      propagator.inject(context, carrier, defaultTextMapSetter);
      expect(baggageToArray(carrier[SENTRY_BAGGAGE_HEADER])).toEqual(
        [
          'sentry-transaction=sampled-transaction',
          'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
          'sentry-sampled=true',
          'sentry-public_key=abc',
          'sentry-environment=production',
          'sentry-release=1.0.0',
        ].sort(),
      );
      expect(carrier[SENTRY_TRACE_HEADER]).toBe('d4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-1');
    });
  });

  describe('extract', () => {
    it('sets sentry span context on the context', () => {
      const sentryTraceHeader = 'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-1';
      carrier[SENTRY_TRACE_HEADER] = sentryTraceHeader;
      const context = propagator.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);
      expect(trace.getSpanContext(context)).toEqual({
        isRemote: true,
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.SAMPLED,
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      });
    });

    it('sets defined sentry trace header on context', () => {
      const sentryTraceHeader = 'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-1';
      carrier[SENTRY_TRACE_HEADER] = sentryTraceHeader;
      const context = propagator.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);

      const propagationContext = getPropagationContextFromContext(context);
      expect(propagationContext).toEqual({
        sampled: true,
        parentSpanId: '6e0c63257de34c92',
        spanId: expect.any(String),
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      });

      // Ensure spanId !== parentSpanId - it should be a new random ID
      expect(propagationContext?.spanId).not.toBe('6e0c63257de34c92');
    });

    it('sets undefined sentry trace header on context', () => {
      const sentryTraceHeader = undefined;
      carrier[SENTRY_TRACE_HEADER] = sentryTraceHeader;
      const context = propagator.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);
      expect(getPropagationContextFromContext(context)).toEqual({
        sampled: undefined,
        spanId: expect.any(String),
        traceId: expect.any(String),
      });
    });

    it('sets defined dynamic sampling context on context', () => {
      const baggage =
        'sentry-environment=production,sentry-release=1.0.0,sentry-public_key=abc,sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b,sentry-transaction=dsc-transaction';
      carrier[SENTRY_BAGGAGE_HEADER] = baggage;
      const context = propagator.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);
      expect(getPropagationContextFromContext(context)).toEqual({
        sampled: undefined,
        spanId: expect.any(String),
        traceId: expect.any(String), // Note: This is not automatically taken from the DSC (in reality, this should be aligned)
        dsc: {
          environment: 'production',
          public_key: 'abc',
          release: '1.0.0',
          trace_id: 'd4cda95b652f4a1592b449d5929fda1b',
          transaction: 'dsc-transaction',
        },
      });
    });

    it('sets undefined dynamic sampling context on context', () => {
      const baggage = '';
      carrier[SENTRY_BAGGAGE_HEADER] = baggage;
      const context = propagator.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);
      expect(getPropagationContextFromContext(context)).toEqual({
        sampled: undefined,
        spanId: expect.any(String),
        traceId: expect.any(String),
      });
    });

    it('handles when sentry-trace is an empty array', () => {
      carrier[SENTRY_TRACE_HEADER] = [];
      const context = propagator.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);
      expect(getPropagationContextFromContext(context)).toEqual({
        sampled: undefined,
        spanId: expect.any(String),
        traceId: expect.any(String),
      });
    });
  });
});

function baggageToArray(baggage: unknown): string[] {
  return typeof baggage === 'string' ? baggage.split(',').sort() : [];
}
