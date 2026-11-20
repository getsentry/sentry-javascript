import type { Event } from '@sentry/core';
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
function expectsSpan(rate: string | undefined, variant: Variant): boolean {
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
      let scenario: ReturnType<typeof runScenario> | undefined;
      async function runScenario() {
        const runner = createRunner()
          .withEnv({
            TRACES_SAMPLE_RATE: config.rate,
            INCOMING_TRACE_VARIANTS: JSON.stringify(VARIANTS),
          })
          .unordered();
        const events: Event[] = [];
        const spanCollections = new Map(
          VARIANTS.filter(variant => expectsSpan(config.rate, variant)).map(variant => [
            variant.key,
            runner.collectStreamedSpansUntilSegment(span => span.attributes['test.variant']?.value === variant.key),
          ]),
        );

        for (const _variant of VARIANTS) {
          runner.expect({
            event: event => {
              events.push(event);
            },
          });
        }

        await runner.start().completed();

        return {
          events,
          spans: new Map(
            await Promise.all([...spanCollections].map(async ([key, spans]) => [key, await spans] as const)),
          ),
        };
      }

      test.each(VARIANTS)('continues the $key', async variant => {
        scenario ??= runScenario();
        const { events, spans } = await scenario;
        const event = events.find(
          event => event.exception?.values?.[0]?.value === `continued-trace-error: ${variant.key}`,
        );
        expect(event).toBeDefined();
        expect(event!.tags?.['test.variant']).toBe(variant.key);
        expect(event!.exception?.values?.[0]?.value).toBe(`continued-trace-error: ${variant.key}`);
        const trace = event!.contexts?.trace;

        if (variant.traceId) {
          expect(trace?.trace_id).toBe(variant.traceId);
        } else {
          expect(trace?.trace_id).toMatch(/^[a-f0-9]{32}$/);
        }
        expect(trace?.span_id).toMatch(/^[a-f0-9]{16}$/);

        // getTraceData() observed inside the callback carries the continued trace id.
        const traceData = (event!.contexts?.traceData ?? {}) as { 'sentry-trace'?: string; baggage?: string };
        expect(traceData['sentry-trace']).toMatch(new RegExp(`^${trace?.trace_id}-[a-f0-9]{16}`));
        if (variant.hasIncomingBaggage) {
          expect(traceData.baggage).toContain(`sentry-trace_id=${variant.traceId}`);
        }

        if (expectsSpan(config.rate, variant)) {
          const collectedSpans = spans.get(variant.key)!;
          const segment = collectedSpans.find(span => span.is_segment);

          if (variant.traceId) {
            expect(segment?.trace_id, variant.key).toBe(variant.traceId);
          } else {
            expect(segment?.trace_id, variant.key).toMatch(/^[a-f0-9]{32}$/);
          }
          if (variant.parentSpanId) {
            expect(segment?.parent_span_id, variant.key).toBe(variant.parentSpanId);
          }
          expect(segment?.name, variant.key).toBe('continued-root-span');
          expect(segment?.trace_id, variant.key).toBe(trace?.trace_id);
        }
      });
    });
  });
});
