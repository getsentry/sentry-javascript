import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// Incoming trace fixtures.
const SAMPLED_TRACE_ID = '12345678901234567890123456789012';
const SAMPLED_SPAN_ID = '1234567890123456';
const SAMPLED_SENTRY_TRACE = `${SAMPLED_TRACE_ID}-${SAMPLED_SPAN_ID}-1`;
const SAMPLED_BAGGAGE =
  'sentry-trace_id=12345678901234567890123456789012,sentry-sample_rate=1,sentry-sampled=true,sentry-public_key=public,sentry-sample_rand=0.42';

const UNSAMPLED_TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const UNSAMPLED_SPAN_ID = '1111111111111111';
const UNSAMPLED_SENTRY_TRACE = `${UNSAMPLED_TRACE_ID}-${UNSAMPLED_SPAN_ID}-0`;

// Deferred sampling decision: no trailing `-0`/`-1` flag, so `parentSampled` is undefined.
const DEFERRED_TRACE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const DEFERRED_SPAN_ID = '2222222222222222';
const DEFERRED_SENTRY_TRACE = `${DEFERRED_TRACE_ID}-${DEFERRED_SPAN_ID}`;

interface Variant {
  key: string;
  sentryTrace?: string;
  baggage?: string;
  /** Expected continued trace id, or undefined for the "no incoming trace" (freshly generated) variant. */
  traceId?: string;
  /** Expected parent span id on the continued root span, if the incoming trace carried one. */
  parentSpanId?: string;
  /** Incoming sampling decision: true (`-1`), false (`-0`), or undefined (deferred / none). */
  parentSampled?: boolean;
  hasIncomingBaggage?: boolean;
}

const VARIANTS: Variant[] = [
  {
    key: 'sampled incoming trace',
    sentryTrace: SAMPLED_SENTRY_TRACE,
    baggage: SAMPLED_BAGGAGE,
    traceId: SAMPLED_TRACE_ID,
    parentSpanId: SAMPLED_SPAN_ID,
    parentSampled: true,
    hasIncomingBaggage: true,
  },
  {
    key: 'unsampled incoming trace',
    sentryTrace: UNSAMPLED_SENTRY_TRACE,
    traceId: UNSAMPLED_TRACE_ID,
    parentSpanId: UNSAMPLED_SPAN_ID,
    parentSampled: false,
  },
  {
    key: 'deferred sampling decision',
    sentryTrace: DEFERRED_SENTRY_TRACE,
    traceId: DEFERRED_TRACE_ID,
    parentSpanId: DEFERRED_SPAN_ID,
    parentSampled: undefined,
  },
  {
    key: 'no incoming sentry-trace',
    parentSampled: undefined,
  },
];

const CONFIGS: { name: string; rate?: string }[] = [
  { name: 'no tracesSampleRate (TwP)', rate: undefined },
  { name: 'tracesSampleRate=1', rate: '1' },
  { name: 'tracesSampleRate=0', rate: '0' },
];

/**
 * Sampling precedence (packages/core/src/tracing/sampling.ts):
 * - TwP (no rate set) -> never sampled.
 * - incoming parentSampled true/false -> overrides local rate.
 * - deferred/none -> local tracesSampleRate decides.
 */
function expectsTransaction(rate: string | undefined, variant: Variant): boolean {
  if (rate === undefined) return false; // TwP: span recording disabled
  if (variant.parentSampled === true) return true; // positive parent decision wins
  if (variant.parentSampled === false) return false; // negative parent decision wins
  return Number(rate) > 0; // deferred / none -> local rate
}

describe('continueTrace', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    describe.each(CONFIGS)('$name', config => {
      test.each(VARIANTS)('continues the $key', async variant => {
        const wantsTransaction = expectsTransaction(config.rate, variant);

        const runner = createRunner().withEnv({
          TRACES_SAMPLE_RATE: config.rate,
          INCOMING_SENTRY_TRACE: variant.sentryTrace,
          INCOMING_BAGGAGE: variant.baggage,
        });

        let observedErrorTraceId: string | undefined;
        let observedTxTraceId: string | undefined;

        // The error event is delayed by async enrichment (context lines, local variables) while the
        // transaction flushes synchronously on span end, so the two envelopes can arrive in either
        // order. Match them by type rather than by position.
        runner.unordered();

        runner.expect({
          event: event => {
            const trace = event.contexts?.trace;
            observedErrorTraceId = trace?.trace_id;

            if (variant.traceId) {
              expect(trace?.trace_id).toBe(variant.traceId);
            } else {
              expect(trace?.trace_id).toMatch(/^[a-f0-9]{32}$/);
            }
            expect(trace?.span_id).toMatch(/^[a-f0-9]{16}$/);

            // getTraceData() observed inside the callback carries the continued trace id.
            const traceData = (event.contexts?.traceData ?? {}) as { 'sentry-trace'?: string; baggage?: string };
            expect(traceData['sentry-trace']).toMatch(new RegExp(`^${trace?.trace_id}-[a-f0-9]{16}`));
            if (variant.hasIncomingBaggage) {
              expect(traceData.baggage).toContain(`sentry-trace_id=${variant.traceId}`);
            }
          },
        });

        if (wantsTransaction) {
          runner.expect({
            transaction: transaction => {
              const trace = transaction.contexts?.trace;
              observedTxTraceId = trace?.trace_id;

              if (variant.traceId) {
                expect(trace?.trace_id).toBe(variant.traceId);
              } else {
                expect(trace?.trace_id).toMatch(/^[a-f0-9]{32}$/);
              }
              if (variant.parentSpanId) {
                expect(trace?.parent_span_id).toBe(variant.parentSpanId);
              }
              expect(transaction.transaction).toBe('continued-root-span');
            },
          });
        }

        await runner.start().completed();

        if (wantsTransaction) {
          // Error and transaction share the (continued or freshly generated) trace id.
          expect(observedTxTraceId).toBe(observedErrorTraceId);
        }
      });
    });
  });
});
