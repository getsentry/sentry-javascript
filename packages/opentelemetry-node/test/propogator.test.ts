import { defaultTextMapSetter, ROOT_CONTEXT, trace, TraceFlags } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { Hub, makeMain } from '@sentry/core';
import { addExtensionMethods, Transaction } from '@sentry/tracing';

import { SENTRY_BAGGAGE_HEADER, SENTRY_TRACE_HEADER } from '../src/constants';
import { SentryPropogator } from '../src/propogator';
import { SENTRY_SPAN_PROCESSOR_MAP } from '../src/spanprocessor';

beforeAll(() => {
  addExtensionMethods();
});

describe('SentryPropogator', () => {
  const propogator = new SentryPropogator();
  let carrier: { [key: string]: unknown };

  beforeEach(() => {
    carrier = {};
  });

  describe('inject', () => {
    describe('sentry-trace', () => {
      it.each([
        [
          'should set sentry-trace header when sampled',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.SAMPLED,
          },
          'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-1',
        ],
        [
          'should set sentry-trace header when not sampled',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.NONE,
          },
          'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-0',
        ],
        [
          'should NOT set sentry-trace header when traceId is empty',
          {
            traceId: '',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.SAMPLED,
          },
          undefined,
        ],
        [
          'should NOT set sentry-trace header when spanId is empty',
          {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '',
            traceFlags: TraceFlags.NONE,
          },
          undefined,
        ],
      ])('%s', (_name, spanContext, expected) => {
        const context = trace.setSpanContext(ROOT_CONTEXT, spanContext);
        propogator.inject(context, carrier, defaultTextMapSetter);
        expect(carrier[SENTRY_TRACE_HEADER]).toBe(expected);
      });

      it('should NOT set sentry-trace header if instrumentation is supressed', () => {
        const spanContext = {
          traceId: 'd4cda95b652f4a1592b449d5929fda1b',
          spanId: '6e0c63257de34c92',
          traceFlags: TraceFlags.SAMPLED,
        };
        const context = suppressTracing(trace.setSpanContext(ROOT_CONTEXT, spanContext));
        propogator.inject(context, carrier, defaultTextMapSetter);
        expect(carrier[SENTRY_TRACE_HEADER]).toBe(undefined);
      });
    });

    describe('baggage', () => {
      const client = {
        getOptions: () => ({
          environment: 'production',
          release: '1.0.0',
        }),
        getDsn: () => ({
          publicKey: 'abc',
        }),
      };
      // @ts-ignore Use mock client for unit tests
      const hub: Hub = new Hub(client);
      makeMain(hub);

      afterEach(() => {
        SENTRY_SPAN_PROCESSOR_MAP.clear();
      });

      describe.each(['transction', 'span'])('with active %s', type => {
        it.each([
          [
            'should set baggage header when sampled',
            {
              traceId: 'd4cda95b652f4a1592b449d5929fda1b',
              spanId: '6e0c63257de34c92',
              traceFlags: TraceFlags.SAMPLED,
            },
            {
              name: 'sampled-transaction',
              traceId: 'd4cda95b652f4a1592b449d5929fda1b',
              spanId: '6e0c63257de34c92',
              sampled: true,
            },
            'sentry-environment=production,sentry-release=1.0.0,sentry-transaction=sampled-transaction,sentry-public_key=abc,sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
          ],
          [
            'should NOT set baggage header when not sampled',
            {
              traceId: 'd4cda95b652f4a1592b449d5929fda1b',
              spanId: '6e0c63257de34c92',
              traceFlags: TraceFlags.NONE,
            },
            {
              name: 'not-sampled-transaction',
              traceId: 'd4cda95b652f4a1592b449d5929fda1b',
              spanId: '6e0c63257de34c92',
              sampled: false,
            },
            'sentry-environment=production,sentry-release=1.0.0,sentry-transaction=not-sampled-transaction,sentry-public_key=abc,sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b',
          ],
          [
            'should NOT set baggage header when traceId is empty',
            {
              traceId: '',
              spanId: '6e0c63257de34c92',
              traceFlags: TraceFlags.SAMPLED,
            },
            {
              name: 'empty-traceId-transaction',
              traceId: '',
              spanId: '6e0c63257de34c92',
              sampled: true,
            },
            undefined,
          ],
          [
            'should NOT set baggage header when spanId is empty',
            {
              traceId: 'd4cda95b652f4a1592b449d5929fda1b',
              spanId: '',
              traceFlags: TraceFlags.SAMPLED,
            },
            {
              name: 'empty-spanId-transaction',
              traceId: 'd4cda95b652f4a1592b449d5929fda1b',
              spanId: '',
              sampled: true,
            },
            undefined,
          ],
        ])('%s', (_name, spanContext, transactionContext, expected) => {
          const transaction = new Transaction(transactionContext, hub);
          SENTRY_SPAN_PROCESSOR_MAP.set(transaction.spanId, transaction);
          if (type === 'span') {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { spanId, ...ctx } = transactionContext;
            const span = transaction.startChild({ ...ctx, description: transaction.name });
            SENTRY_SPAN_PROCESSOR_MAP.set(span.spanId, span);
          }
          const context = trace.setSpanContext(ROOT_CONTEXT, spanContext);
          propogator.inject(context, carrier, defaultTextMapSetter);
          expect(carrier[SENTRY_BAGGAGE_HEADER]).toBe(expected);
        });

        it('should NOT set sentry-trace header if instrumentation is supressed', () => {
          const spanContext = {
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            traceFlags: TraceFlags.SAMPLED,
          };
          const transactionContext = {
            name: 'sampled-transaction',
            traceId: 'd4cda95b652f4a1592b449d5929fda1b',
            spanId: '6e0c63257de34c92',
            sampled: true,
          };
          const transaction = new Transaction(transactionContext, hub);
          SENTRY_SPAN_PROCESSOR_MAP.set(transaction.spanId, transaction);
          if (type === 'span') {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { spanId, ...ctx } = transactionContext;
            const span = transaction.startChild({ ...ctx, description: transaction.name });
            SENTRY_SPAN_PROCESSOR_MAP.set(span.spanId, span);
          }
          const context = suppressTracing(trace.setSpanContext(ROOT_CONTEXT, spanContext));
          propogator.inject(context, carrier, defaultTextMapSetter);
          expect(carrier[SENTRY_TRACE_HEADER]).toBe(undefined);
        });
      });
    });
  });
});
