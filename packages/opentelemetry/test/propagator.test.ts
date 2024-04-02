import {
  ROOT_CONTEXT,
  TraceFlags,
  context,
  defaultTextMapGetter,
  defaultTextMapSetter,
  propagation,
  trace,
} from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { addTracingExtensions, withScope } from '@sentry/core';

import { SENTRY_BAGGAGE_HEADER, SENTRY_SCOPES_CONTEXT_KEY, SENTRY_TRACE_HEADER } from '../src/constants';
import { SentryPropagator, makeTraceState } from '../src/propagator';
import { getScopesFromContext } from '../src/utils/contextData';
import { getSamplingDecision } from '../src/utils/getSamplingDecision';
import { cleanupOtel, mockSdkInit } from './helpers/mockSdkInit';

beforeAll(() => {
  addTracingExtensions();
});

describe('SentryPropagator', () => {
  const propagator = new SentryPropagator();
  let carrier: { [key: string]: unknown };

  beforeEach(() => {
    carrier = {};
    mockSdkInit({
      environment: 'production',
      release: '1.0.0',
      enableTracing: true,
      dsn: 'https://abc@domain/123',
    });
  });

  afterEach(() => {
    cleanupOtel();
  });

  it('returns fields set', () => {
    expect(propagator.fields()).toEqual([SENTRY_TRACE_HEADER, SENTRY_BAGGAGE_HEADER]);
  });

  describe('inject', () => {
    describe('without active local span', () => {
      it.each([
        [
          'uses remote spanContext without DSC for sampled remote span',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.SAMPLED,
            isRemote: true,
          },
          [
            'sentry-environment=production',
            'sentry-release=1.0.0',
            'sentry-public_key=abc',
            'sentry-sampled=true',
            'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
          ],
          'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-1',
        ],
        [
          'uses remote spanContext without DSC for unsampled remote span',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.NONE,
            isRemote: true,
          },
          [
            'sentry-environment=production',
            'sentry-release=1.0.0',
            'sentry-public_key=abc',
            'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
          ],
          'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92',
        ],
        [
          'uses remote spanContext with trace state & without DSC for unsampled remote span',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.NONE,
            isRemote: true,
            traceState: makeTraceState({
              sampled: false,
            }),
          },
          [
            'sentry-environment=production',
            'sentry-release=1.0.0',
            'sentry-public_key=abc',
            'sentry-sampled=false',
            'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
          ],
          'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-0',
        ],
        [
          'uses remote spanContext with DSC for sampled remote span',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.SAMPLED,
            traceState: makeTraceState({
              parentSpanId: '6e0c63257de34c92',
              dsc: {
                transaction: 'sampled-transaction',
                sampled: 'true',
                trace_id: 'dsc_trace_id',
                public_key: 'dsc_public_key',
                environment: 'dsc_environment',
                release: 'dsc_release',
                sample_rate: '0.5',
                replay_id: 'dsc_replay_id',
              },
            }),
            isRemote: true,
          },
          [
            'sentry-environment=dsc_environment',
            'sentry-release=dsc_release',
            'sentry-public_key=dsc_public_key',
            'sentry-trace_id=dsc_trace_id',
            'sentry-transaction=sampled-transaction',
            'sentry-sampled=true',
            'sentry-sample_rate=0.5',
            'sentry-replay_id=dsc_replay_id',
          ],
          'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-1',
        ],
        [
          'uses remote spanContext with DSC for unsampled remote span',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.NONE,
            traceState: makeTraceState({
              parentSpanId: '6e0c63257de34c92',
              dsc: {
                transaction: 'sampled-transaction',
                sampled: 'false',
                trace_id: 'dsc_trace_id',
                public_key: 'dsc_public_key',
                environment: 'dsc_environment',
                release: 'dsc_release',
                sample_rate: '0.5',
                replay_id: 'dsc_replay_id',
              },
            }),
            isRemote: true,
          },
          [
            'sentry-environment=dsc_environment',
            'sentry-release=dsc_release',
            'sentry-public_key=dsc_public_key',
            'sentry-trace_id=dsc_trace_id',
            'sentry-transaction=sampled-transaction',
            'sentry-sampled=false',
            'sentry-sample_rate=0.5',
            'sentry-replay_id=dsc_replay_id',
          ],
          'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-0',
        ],
      ])('%s', (_name, spanContext, baggage, sentryTrace) => {
        const ctx = trace.setSpanContext(ROOT_CONTEXT, spanContext);
        propagator.inject(ctx, carrier, defaultTextMapSetter);

        expect(baggageToArray(carrier[SENTRY_BAGGAGE_HEADER])).toEqual(baggage.sort());
        expect(carrier[SENTRY_TRACE_HEADER]).toBe(sentryTrace);
      });

      it('uses scope propagation context without DSC if no span is found', () => {
        withScope(scope => {
          scope.setPropagationContext({
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            parentSpanId: '6e0c63257de34c93',
            spanId: '6e0c63257de34c92',
            sampled: true,
          });

          propagator.inject(context.active(), carrier, defaultTextMapSetter);

          expect(baggageToArray(carrier[SENTRY_BAGGAGE_HEADER])).toEqual(
            [
              'sentry-environment=production',
              'sentry-release=1.0.0',
              'sentry-public_key=abc',
              'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
            ].sort(),
          );
          expect(carrier[SENTRY_TRACE_HEADER]).toBe('d4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-1');
        });
      });

      it('uses scope propagation context with DSC if no span is found', () => {
        withScope(scope => {
          scope.setPropagationContext({
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            parentSpanId: '6e0c63257de34c93',
            spanId: '6e0c63257de34c92',
            sampled: true,
            dsc: {
              transaction: 'sampled-transaction',
              sampled: 'false',
              trace_id: 'dsc_trace_id',
              public_key: 'dsc_public_key',
              environment: 'dsc_environment',
              release: 'dsc_release',
              sample_rate: '0.5',
              replay_id: 'dsc_replay_id',
            },
          });

          propagator.inject(context.active(), carrier, defaultTextMapSetter);

          expect(baggageToArray(carrier[SENTRY_BAGGAGE_HEADER])).toEqual(
            [
              'sentry-environment=dsc_environment',
              'sentry-release=dsc_release',
              'sentry-public_key=dsc_public_key',
              'sentry-trace_id=dsc_trace_id',
              'sentry-transaction=sampled-transaction',
              'sentry-sampled=false',
              'sentry-sample_rate=0.5',
              'sentry-replay_id=dsc_replay_id',
            ].sort(),
          );
          expect(carrier[SENTRY_TRACE_HEADER]).toBe('d4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-1');
        });
      });

      it('uses scope propagation context over remote spanContext', () => {
        context.with(
          trace.setSpanContext(ROOT_CONTEXT, {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.NONE,
            isRemote: true,
          }),
          () => {
            withScope(scope => {
              scope.setPropagationContext({
                traceId: 'TRACE_ID',
                parentSpanId: 'PARENT_SPAN_ID',
                spanId: 'SPAN_ID',
                sampled: true,
              });

              propagator.inject(context.active(), carrier, defaultTextMapSetter);

              expect(baggageToArray(carrier[SENTRY_BAGGAGE_HEADER])).toEqual(
                [
                  'sentry-environment=production',
                  'sentry-release=1.0.0',
                  'sentry-public_key=abc',
                  'sentry-trace_id=TRACE_ID',
                ].sort(),
              );
              expect(carrier[SENTRY_TRACE_HEADER]).toBe('TRACE_ID-SPAN_ID-1');
            });
          },
        );
      });

      it('creates random traceId & spanId if no scope & span is found', () => {
        const ctx = trace.deleteSpan(ROOT_CONTEXT).deleteValue(SENTRY_SCOPES_CONTEXT_KEY);
        propagator.inject(ctx, carrier, defaultTextMapSetter);

        expect(baggageToArray(carrier[SENTRY_BAGGAGE_HEADER])).toEqual([]);
        expect(carrier[SENTRY_TRACE_HEADER]).toMatch(/^\w{32}-\w{16}$/);
      });
    });

    describe('with active span', () => {
      it.each([
        [
          'continues a remote trace without dsc',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.SAMPLED,
            isRemote: true,
          },
          [
            'sentry-environment=production',
            'sentry-release=1.0.0',
            'sentry-public_key=abc',
            'sentry-sample_rate=1',
            'sentry-sampled=true',
            'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
            'sentry-transaction=test',
          ],
          'd4cda95b652f4a1592b449d5929fda1b-{{spanId}}-1',
          true,
        ],
        [
          'continues a remote trace with dsc',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.SAMPLED,
            isRemote: true,
            traceState: makeTraceState({
              parentSpanId: '6e0c63257de34c92',
              dsc: {
                transaction: 'sampled-transaction',
                sampled: 'true',
                trace_id: 'dsc_trace_id',
                public_key: 'dsc_public_key',
                environment: 'dsc_environment',
                release: 'dsc_release',
                sample_rate: '0.5',
                replay_id: 'dsc_replay_id',
              },
            }),
          },
          [
            'sentry-environment=dsc_environment',
            'sentry-release=dsc_release',
            'sentry-public_key=dsc_public_key',
            'sentry-trace_id=dsc_trace_id',
            'sentry-transaction=sampled-transaction',
            'sentry-sampled=true',
            'sentry-sample_rate=0.5',
            'sentry-replay_id=dsc_replay_id',
          ],
          'd4cda95b652f4a1592b449d5929fda1b-{{spanId}}-1',
          true,
        ],
        [
          'continues an unsampled remote trace without dsc',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.NONE,
            isRemote: true,
          },
          [
            'sentry-environment=production',
            'sentry-release=1.0.0',
            'sentry-public_key=abc',
            'sentry-sample_rate=1',
            'sentry-sampled=true',
            'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
            'sentry-transaction=test',
          ],
          'd4cda95b652f4a1592b449d5929fda1b-{{spanId}}-1',
          undefined,
        ],
        [
          'continues an unsampled remote trace with sampled trace state & without dsc',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.NONE,
            isRemote: true,
            traceState: makeTraceState({
              sampled: false,
            }),
          },
          [
            'sentry-environment=production',
            'sentry-release=1.0.0',
            'sentry-public_key=abc',
            'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
            'sentry-sampled=false',
          ],
          'd4cda95b652f4a1592b449d5929fda1b-{{spanId}}-0',
          false,
        ],
        [
          'continues an unsampled remote trace with dsc',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.NONE,
            isRemote: true,
            traceState: makeTraceState({
              parentSpanId: '6e0c63257de34c92',
              dsc: {
                transaction: 'sampled-transaction',
                sampled: 'false',
                trace_id: 'dsc_trace_id',
                public_key: 'dsc_public_key',
                environment: 'dsc_environment',
                release: 'dsc_release',
                sample_rate: '0.5',
                replay_id: 'dsc_replay_id',
              },
            }),
          },
          [
            'sentry-environment=dsc_environment',
            'sentry-release=dsc_release',
            'sentry-public_key=dsc_public_key',
            'sentry-trace_id=dsc_trace_id',
            'sentry-transaction=sampled-transaction',
            'sentry-sampled=false',
            'sentry-sample_rate=0.5',
            'sentry-replay_id=dsc_replay_id',
          ],
          'd4cda95b652f4a1592b449d5929fda1b-{{spanId}}-0',
          false,
        ],
        [
          'continues an unsampled remote trace with dsc & sampled trace state',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.NONE,
            isRemote: true,
            traceState: makeTraceState({
              sampled: false,
              parentSpanId: '6e0c63257de34c92',
              dsc: {
                transaction: 'sampled-transaction',
                trace_id: 'dsc_trace_id',
                public_key: 'dsc_public_key',
                environment: 'dsc_environment',
                release: 'dsc_release',
                sample_rate: '0.5',
                replay_id: 'dsc_replay_id',
              },
            }),
          },
          [
            'sentry-environment=dsc_environment',
            'sentry-release=dsc_release',
            'sentry-public_key=dsc_public_key',
            'sentry-trace_id=dsc_trace_id',
            'sentry-transaction=sampled-transaction',
            'sentry-sample_rate=0.5',
            'sentry-replay_id=dsc_replay_id',
          ],
          'd4cda95b652f4a1592b449d5929fda1b-{{spanId}}-0',
          false,
        ],
        [
          'starts a new trace without existing dsc',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.SAMPLED,
          },
          [
            'sentry-environment=production',
            'sentry-release=1.0.0',
            'sentry-public_key=abc',
            'sentry-sampled=true',
            'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
          ],
          'd4cda95b652f4a1592b449d5929fda1b-{{spanId}}-1',
          true,
        ],
      ])('%s', (_name, spanContext, baggage, sentryTrace, samplingDecision) => {
        expect(getSamplingDecision(spanContext)).toBe(samplingDecision);

        context.with(trace.setSpanContext(ROOT_CONTEXT, spanContext), () => {
          trace.getTracer('test').startActiveSpan('test', span => {
            propagator.inject(context.active(), carrier, defaultTextMapSetter);

            expect(baggageToArray(carrier[SENTRY_BAGGAGE_HEADER])).toEqual(baggage.sort());
            expect(carrier[SENTRY_TRACE_HEADER]).toBe(sentryTrace.replace('{{spanId}}', span.spanContext().spanId));
          });
        });
      });

      it('uses local span over propagation context', () => {
        context.with(
          trace.setSpanContext(ROOT_CONTEXT, {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.SAMPLED,
            isRemote: true,
          }),
          () => {
            trace.getTracer('test').startActiveSpan('test', span => {
              withScope(scope => {
                scope.setPropagationContext({
                  traceId: 'TRACE_ID',
                  parentSpanId: 'PARENT_SPAN_ID',
                  spanId: 'SPAN_ID',
                  sampled: true,
                });

                propagator.inject(context.active(), carrier, defaultTextMapSetter);

                expect(baggageToArray(carrier[SENTRY_BAGGAGE_HEADER])).toEqual(
                  [
                    'sentry-environment=production',
                    'sentry-release=1.0.0',
                    'sentry-public_key=abc',
                    'sentry-sample_rate=1',
                    'sentry-sampled=true',
                    'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
                    'sentry-transaction=test',
                  ].sort(),
                );
                expect(carrier[SENTRY_TRACE_HEADER]).toBe(
                  `d4cda95b652f4a1592b449d5929fda1b-${span.spanContext().spanId}-1`,
                );
              });
            });
          },
        );

        const carrier2: Record<string, string> = {};
        context.with(
          trace.setSpanContext(ROOT_CONTEXT, {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.NONE,
            isRemote: true,
          }),
          () => {
            withScope(scope => {
              scope.setPropagationContext({
                traceId: 'TRACE_ID',
                parentSpanId: 'PARENT_SPAN_ID',
                spanId: 'SPAN_ID',
                sampled: true,
              });

              propagator.inject(context.active(), carrier2, defaultTextMapSetter);

              expect(baggageToArray(carrier2[SENTRY_BAGGAGE_HEADER])).toEqual(
                [
                  'sentry-environment=production',
                  'sentry-release=1.0.0',
                  'sentry-public_key=abc',
                  'sentry-trace_id=TRACE_ID',
                ].sort(),
              );
              expect(carrier2[SENTRY_TRACE_HEADER]).toBe('TRACE_ID-SPAN_ID-1');
            });
          },
        );
      });
    });

    it('should include existing baggage', () => {
      const spanContext = {
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.SAMPLED,
      };
      const context = trace.setSpanContext(ROOT_CONTEXT, spanContext);
      const baggage = propagation.createBaggage({ foo: { value: 'bar' } });
      propagator.inject(propagation.setBaggage(context, baggage), carrier, defaultTextMapSetter);
      expect(baggageToArray(carrier[SENTRY_BAGGAGE_HEADER])).toEqual(
        [
          'foo=bar',
          'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
          'sentry-public_key=abc',
          'sentry-environment=production',
          'sentry-release=1.0.0',
          'sentry-sampled=true',
        ].sort(),
      );
    });

    it('should include existing baggage header', () => {
      const spanContext = {
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.SAMPLED,
      };

      const carrier = {
        other: 'header',
        baggage: 'foo=bar,other=yes',
      };
      const context = trace.setSpanContext(ROOT_CONTEXT, spanContext);
      const baggage = propagation.createBaggage();
      propagator.inject(propagation.setBaggage(context, baggage), carrier, defaultTextMapSetter);
      expect(baggageToArray(carrier[SENTRY_BAGGAGE_HEADER])).toEqual(
        [
          'foo=bar',
          'other=yes',
          'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
          'sentry-public_key=abc',
          'sentry-environment=production',
          'sentry-release=1.0.0',
          'sentry-sampled=true',
        ].sort(),
      );
    });

    it('should include existing baggage array header', () => {
      const spanContext = {
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.SAMPLED,
      };

      const carrier = {
        other: 'header',
        baggage: ['foo=bar,other=yes', 'other2=no'],
      };
      const context = trace.setSpanContext(ROOT_CONTEXT, spanContext);
      const baggage = propagation.createBaggage();
      propagator.inject(propagation.setBaggage(context, baggage), carrier, defaultTextMapSetter);
      expect(baggageToArray(carrier[SENTRY_BAGGAGE_HEADER])).toEqual(
        [
          'foo=bar',
          'other=yes',
          'other2=no',
          'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
          'sentry-public_key=abc',
          'sentry-environment=production',
          'sentry-release=1.0.0',
          'sentry-sampled=true',
        ].sort(),
      );
    });

    it('should overwrite existing sentry baggage header', () => {
      const spanContext = {
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.SAMPLED,
      };

      const carrier = {
        baggage: 'foo=bar,other=yes,sentry-release=9.9.9,sentry-other=yes',
      };
      const context = trace.setSpanContext(ROOT_CONTEXT, spanContext);
      const baggage = propagation.createBaggage();
      propagator.inject(propagation.setBaggage(context, baggage), carrier, defaultTextMapSetter);
      expect(baggageToArray(carrier[SENTRY_BAGGAGE_HEADER])).toEqual(
        [
          'foo=bar',
          'other=yes',
          'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
          'sentry-public_key=abc',
          'sentry-environment=production',
          'sentry-other=yes',
          'sentry-release=1.0.0',
          'sentry-sampled=true',
        ].sort(),
      );
    });

    it('should create baggage without propagation context', () => {
      const context = ROOT_CONTEXT;
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

      const context = suppressTracing(trace.setSpanContext(ROOT_CONTEXT, spanContext));
      propagator.inject(context, carrier, defaultTextMapSetter);
      expect(carrier[SENTRY_TRACE_HEADER]).toBe(undefined);
      expect(carrier[SENTRY_BAGGAGE_HEADER]).toBe(undefined);
    });
  });

  describe('extract', () => {
    it('sets data from sentry trace header on span context', () => {
      const sentryTraceHeader = 'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-1';
      carrier[SENTRY_TRACE_HEADER] = sentryTraceHeader;
      const context = propagator.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);
      expect(trace.getSpanContext(context)).toEqual({
        isRemote: true,
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.SAMPLED,
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        traceState: makeTraceState({ parentSpanId: '6e0c63257de34c92' }),
      });
      expect(getSamplingDecision(trace.getSpanContext(context)!)).toBe(true);
    });

    it('sets data from negative sampled sentry trace header on span context', () => {
      const sentryTraceHeader = 'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-0';
      carrier[SENTRY_TRACE_HEADER] = sentryTraceHeader;
      const context = propagator.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);
      expect(trace.getSpanContext(context)).toEqual({
        isRemote: true,
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.NONE,
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        traceState: makeTraceState({ parentSpanId: '6e0c63257de34c92', sampled: false }),
      });
      expect(getSamplingDecision(trace.getSpanContext(context)!)).toBe(false);
    });

    it('sets data from not sampled sentry trace header on span context', () => {
      const sentryTraceHeader = 'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92';
      carrier[SENTRY_TRACE_HEADER] = sentryTraceHeader;
      const context = propagator.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);
      expect(trace.getSpanContext(context)).toEqual({
        isRemote: true,
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.NONE,
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        traceState: makeTraceState({ parentSpanId: '6e0c63257de34c92' }),
      });
      expect(getSamplingDecision(trace.getSpanContext(context)!)).toBe(undefined);
    });

    it('sets data from sentry trace header on scope', () => {
      const sentryTraceHeader = 'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-1';
      carrier[SENTRY_TRACE_HEADER] = sentryTraceHeader;
      const context = propagator.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);

      const scopes = getScopesFromContext(context);

      expect(scopes).toBeDefined();
      expect(scopes?.scope.getPropagationContext()).toEqual({
        spanId: expect.any(String),
        sampled: true,
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        parentSpanId: '6e0c63257de34c92',
        dsc: {},
      });
      expect(getSamplingDecision(trace.getSpanContext(context)!)).toBe(true);
    });

    it('handles undefined sentry trace header', () => {
      const sentryTraceHeader = undefined;
      carrier[SENTRY_TRACE_HEADER] = sentryTraceHeader;
      const context = propagator.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);
      expect(trace.getSpanContext(context)).toEqual({
        isRemote: true,
        spanId: expect.any(String),
        traceFlags: TraceFlags.NONE,
        traceId: expect.any(String),
      });
      expect(getSamplingDecision(trace.getSpanContext(context)!)).toBe(undefined);
    });

    it('sets data from baggage header on span context', () => {
      const sentryTraceHeader = 'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-1';
      const baggage =
        'sentry-environment=production,sentry-release=1.0.0,sentry-public_key=abc,sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b,sentry-transaction=dsc-transaction';
      carrier[SENTRY_TRACE_HEADER] = sentryTraceHeader;
      carrier[SENTRY_BAGGAGE_HEADER] = baggage;
      const context = propagator.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);
      expect(trace.getSpanContext(context)).toEqual({
        isRemote: true,
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.SAMPLED,
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        traceState: makeTraceState({
          parentSpanId: '6e0c63257de34c92',
          dsc: {
            environment: 'production',
            release: '1.0.0',
            public_key: 'abc',
            trace_id: 'd4cda95b652f4a1592b449d5929fda1b',
            transaction: 'dsc-transaction',
          },
        }),
      });
      expect(getSamplingDecision(trace.getSpanContext(context)!)).toBe(true);
    });

    it('sets data from baggage header on scope', () => {
      const sentryTraceHeader = 'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-1';
      const baggage =
        'sentry-environment=production,sentry-release=1.0.0,sentry-public_key=abc,sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b,sentry-transaction=dsc-transaction';
      carrier[SENTRY_TRACE_HEADER] = sentryTraceHeader;
      carrier[SENTRY_BAGGAGE_HEADER] = baggage;
      const context = propagator.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);

      const scopes = getScopesFromContext(context);

      expect(scopes).toBeDefined();
      expect(scopes?.scope.getPropagationContext()).toEqual({
        spanId: expect.any(String),
        sampled: true,
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        parentSpanId: '6e0c63257de34c92',
        dsc: {
          environment: 'production',
          release: '1.0.0',
          public_key: 'abc',
          trace_id: 'd4cda95b652f4a1592b449d5929fda1b',
          transaction: 'dsc-transaction',
        },
      });
    });

    it('handles empty dsc baggage header', () => {
      const baggage = '';
      carrier[SENTRY_BAGGAGE_HEADER] = baggage;
      const context = propagator.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);
      expect(trace.getSpanContext(context)).toEqual({
        isRemote: true,
        spanId: expect.any(String),
        traceFlags: TraceFlags.NONE,
        traceId: expect.any(String),
      });
      expect(getSamplingDecision(trace.getSpanContext(context)!)).toBe(undefined);
    });

    it('handles when sentry-trace is an empty array', () => {
      carrier[SENTRY_TRACE_HEADER] = [];
      const context = propagator.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);
      expect(trace.getSpanContext(context)).toEqual({
        isRemote: true,
        spanId: expect.any(String),
        traceFlags: TraceFlags.NONE,
        traceId: expect.any(String),
      });
    });
  });
});

function baggageToArray(baggage: unknown): string[] {
  return typeof baggage === 'string' ? baggage.split(',').sort() : [];
}
