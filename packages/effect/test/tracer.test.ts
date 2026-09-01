import { describe, expect, it } from '@effect/vitest';
import * as sentryCore from '@sentry/core';
import * as sentryCoreBrowser from '@sentry/core/browser';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { ServerRuntimeClient } from '@sentry/core/server';
import { Effect } from 'effect';
import * as Tracer from 'effect/Tracer';
import { afterEach, beforeEach, vi } from 'vitest';
import { SentryEffectTracer as clientTracer } from '../src/client/tracer';
import { SentryEffectTracer as serverTracer } from '../src/server/tracer';

// The two variants differ only in which module they start spans through, so spying on `spanApi` also
// asserts that wiring: the client tracer must go through `@sentry/core/browser` (which installs
// `spanStreamingIntegration`) and the server tracer through the plain `@sentry/core`.
const VARIANTS = [
  { variant: 'client', tracer: clientTracer, spanApi: sentryCoreBrowser as SpanApi },
  { variant: 'server', tracer: serverTracer, spanApi: sentryCore as SpanApi },
];

interface SpanApi {
  startInactiveSpan: typeof sentryCore.startInactiveSpan;
}

function mockSpan(overrides: Record<string, unknown> = {}): sentryCore.Span {
  return {
    spanContext: () => ({ spanId: 'test-span-id', traceId: 'test-trace-id' }),
    isRecording: () => true,
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    addEvent: vi.fn(),
    end: vi.fn(),
    ...overrides,
  } as unknown as sentryCore.Span;
}

describe.each(VARIANTS)('SentryEffectTracer ($variant)', ({ variant, tracer, spanApi }) => {
  const withSentryTracer = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.withTracer(effect, tracer);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.effect('traces Effect spans to Sentry', () =>
    Effect.gen(function* () {
      let capturedSpanName: string | undefined;

      yield* Effect.withSpan('test-parent-span')(
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan('test-attribute', 'test-value');
          capturedSpanName = 'effect-span-executed';
        }),
      );

      expect(capturedSpanName).toBe('effect-span-executed');
    }).pipe(withSentryTracer),
  );

  it.effect('creates spans with correct attributes', () =>
    Effect.gen(function* () {
      const result = yield* Effect.withSpan('my-operation')(Effect.succeed('success'));

      expect(result).toBe('success');
    }).pipe(withSentryTracer),
  );

  it.effect('handles nested spans', () =>
    Effect.gen(function* () {
      const result = yield* Effect.withSpan('outer')(
        Effect.gen(function* () {
          const inner = yield* Effect.withSpan('inner')(Effect.succeed('inner-result'));
          return `outer-${inner}`;
        }),
      );

      expect(result).toBe('outer-inner-result');
    }).pipe(withSentryTracer),
  );

  it.effect('propagates span context through Effect fibers', () =>
    Effect.gen(function* () {
      const results: string[] = [];

      yield* Effect.withSpan('parent')(
        Effect.gen(function* () {
          results.push('parent-start');
          yield* Effect.withSpan('child-1')(Effect.sync(() => results.push('child-1')));
          yield* Effect.withSpan('child-2')(Effect.sync(() => results.push('child-2')));
        }),
      );

      expect(results).toEqual(['parent-start', 'child-1', 'child-2']);
    }).pipe(withSentryTracer),
  );

  it.effect('handles concurrent spans', () =>
    Effect.gen(function* () {
      const results = yield* Effect.all(
        [
          Effect.withSpan('concurrent-1')(Effect.succeed(1)),
          Effect.withSpan('concurrent-2')(Effect.succeed(2)),
          Effect.withSpan('concurrent-3')(Effect.succeed(3)),
        ],
        { concurrency: 'unbounded' },
      );

      expect(results).toEqual([1, 2, 3]);
    }).pipe(withSentryTracer),
  );

  it.effect('supports span annotations', () =>
    Effect.gen(function* () {
      const result = yield* Effect.succeed('annotated').pipe(
        Effect.withSpan('annotated-span'),
        Effect.tap(() => Effect.annotateCurrentSpan('custom-key', 'custom-value')),
      );

      expect(result).toBe('annotated');
    }).pipe(withSentryTracer),
  );

  it.effect('sets span status to ok on success', () =>
    Effect.gen(function* () {
      const setStatusCalls: Array<{ code: number; message?: string }> = [];

      vi.spyOn(spanApi, 'startInactiveSpan').mockImplementation(() =>
        mockSpan({ setStatus: (status: { code: number; message?: string }) => setStatusCalls.push(status) }),
      );

      yield* Effect.withSpan('success-span')(Effect.succeed('ok'));

      expect(setStatusCalls).toContainEqual({ code: 1 });
    }).pipe(withSentryTracer),
  );

  it.effect('sets span status to error on failure', () =>
    Effect.gen(function* () {
      const setStatusCalls: Array<{ code: number; message?: string }> = [];

      vi.spyOn(spanApi, 'startInactiveSpan').mockImplementation(() =>
        mockSpan({ setStatus: (status: { code: number; message?: string }) => setStatusCalls.push(status) }),
      );

      yield* Effect.withSpan('error-span')(Effect.fail('test-error')).pipe(Effect.catchCause(() => Effect.void));

      expect(setStatusCalls).toContainEqual({ code: 2, message: 'test-error' });
    }).pipe(withSentryTracer),
  );

  it.effect('sets span status to error on defect', () =>
    Effect.gen(function* () {
      const setStatusCalls: Array<{ code: number; message?: string }> = [];

      vi.spyOn(spanApi, 'startInactiveSpan').mockImplementation(() =>
        mockSpan({ setStatus: (status: { code: number; message?: string }) => setStatusCalls.push(status) }),
      );

      yield* Effect.withSpan('defect-span')(Effect.die('fatal-defect')).pipe(Effect.catchDefect(() => Effect.void));

      expect(setStatusCalls).toContainEqual({ code: 2, message: 'fatal-defect' });
    }).pipe(withSentryTracer),
  );

  it.effect('propagates Sentry span context via withActiveSpan', () =>
    Effect.gen(function* () {
      const withActiveSpanCalls: sentryCore.Span[] = [];

      vi.spyOn(sentryCore, 'withActiveSpan').mockImplementation(
        <T>(span: sentryCore.Span | null, callback: (scope: sentryCore.Scope) => T): T => {
          if (span) {
            withActiveSpanCalls.push(span);
          }
          return callback({} as sentryCore.Scope);
        },
      );

      yield* Effect.withSpan('context-span')(Effect.succeed('done'));

      expect(withActiveSpanCalls.length).toBeGreaterThan(0);
    }).pipe(withSentryTracer),
  );

  /** Captures the attributes the tracer passes to `startInactiveSpan` for a given Effect span name. */
  const attributesFor = (spanName: string) =>
    Effect.gen(function* () {
      let capturedAttributes: Record<string, unknown> | undefined;

      vi.spyOn(spanApi, 'startInactiveSpan').mockImplementation(options => {
        capturedAttributes = options.attributes;
        return mockSpan();
      });

      yield* Effect.withSpan(spanName)(Effect.succeed('ok'));

      return capturedAttributes;
    }).pipe(withSentryTracer);

  it.effect('sets origin and op for regular spans', () =>
    Effect.gen(function* () {
      const attributes = yield* attributesFor('my-operation');

      expect(attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toBe('auto.function.effect');
      expect(attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBe('function');
    }),
  );

  it.effect('sets origin and op for http.server spans', () =>
    Effect.gen(function* () {
      const attributes = yield* attributesFor('http.server GET /api/users');

      expect(attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toBe('auto.http.effect');
      expect(attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBe('http.server');
    }),
  );

  it.effect('sets origin and op for http.client spans', () =>
    Effect.gen(function* () {
      const attributes = yield* attributesFor('http.client GET https://api.example.com');

      expect(attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toBe('auto.http.effect');
      expect(attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toBe('http.client');
    }),
  );

  it.effect('can be used with Effect.withTracer', () =>
    Effect.gen(function* () {
      const result = yield* Effect.withSpan('inline-tracer-span')(Effect.succeed('with-tracer'));
      expect(result).toBe('with-tracer');
    }).pipe(Effect.withTracer(tracer)),
  );

  describe('trace structure', () => {
    const traceId = 'a'.repeat(32);
    const spanId = 'b'.repeat(16);

    beforeEach(() => {
      const client = new ServerRuntimeClient({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        integrations: [],
        transport: () => sentryCore.createTransport({ recordDroppedEvent: () => undefined }, () => Promise.resolve({})),
        stackParser: () => [],
        tracesSampleRate: 1,
        traceLifecycle: 'static',
      });
      sentryCore.getCurrentScope().setClient(client);
      client.init();
    });

    afterEach(() => {
      sentryCore.getCurrentScope().setClient(undefined);
    });

    const currentSentrySpan = Effect.map(
      Effect.currentSpan,
      span => (span as unknown as { sentrySpan: sentryCore.Span }).sentrySpan,
    );

    const run = <A, E>(effect: Effect.Effect<A, E>): A => Effect.runSync(Effect.withTracer(effect, tracer));

    it('continues the trace of an external parent as a new root span', () => {
      const parent = Tracer.externalSpan({ traceId, spanId, sampled: true });
      const span = run(Effect.withSpan('reactor', { parent })(currentSentrySpan));

      expect(sentryCore.spanToJSON(span)).toMatchObject({ trace_id: traceId, parent_span_id: spanId });
      expect(sentryCore.spanIsSampled(span)).toBe(true);
      expect(sentryCore.getDynamicSamplingContextFromSpan(span)).toMatchObject({
        trace_id: traceId,
        public_key: 'public',
        sampled: 'true',
      });
    });

    it('honors the sampling decision of an external parent', () => {
      const parent = Tracer.externalSpan({ traceId, spanId, sampled: false });
      const span = run(Effect.withSpan('reactor', { parent })(currentSentrySpan));

      expect(sentryCore.spanToJSON(span).trace_id).toBe(traceId);
      expect(sentryCore.spanIsSampled(span)).toBe(false);
    });

    it('does not nest a root: true span under the enclosing Effect span', () => {
      const [outer, inner] = run(
        Effect.withSpan('outer')(
          Effect.all([currentSentrySpan, Effect.withSpan('inner', { root: true })(currentSentrySpan)]),
        ),
      );

      expect(sentryCore.spanToJSON(inner).parent_span_id).toBeUndefined();
      if (variant === 'server') {
        expect(sentryCore.spanToJSON(inner).trace_id).not.toBe(sentryCore.spanToJSON(outer).trace_id);
      } else {
        expect(sentryCore.spanToJSON(inner).trace_id).toBe(sentryCore.spanToJSON(outer).trace_id);
      }
    });

    it('nests a parentless Effect span under a foreign active Sentry span', () => {
      sentryCore.startSpan({ name: 'http.server' }, request => {
        const span = run(Effect.withSpan('handler')(currentSentrySpan));

        expect(sentryCore.spanToJSON(span).parent_span_id).toBe(request.spanContext().spanId);
        expect(sentryCore.spanToJSON(span).trace_id).toBe(request.spanContext().traceId);
      });
    });

    it('does not parent a parentless Effect span on a span leaked from another fiber', () => {
      const leaked = run(Effect.withSpan('other-fiber')(currentSentrySpan));

      sentryCore.withActiveSpan(leaked, () => {
        const span = run(Effect.withSpan('root')(currentSentrySpan));

        expect(sentryCore.spanToJSON(span).parent_span_id).toBeUndefined();
      });
    });

    it('does not parent a parentless Effect span on an unsampled span leaked from another fiber', () => {
      const leaked = sentryCore.withScope(scope => {
        scope.setPropagationContext({ traceId, sampled: false, sampleRand: 0.5 });
        return run(Effect.withSpan('unsampled-fiber')(currentSentrySpan));
      });
      expect(sentryCore.spanIsSampled(leaked)).toBe(false);

      sentryCore.withActiveSpan(leaked, () => {
        const span = run(Effect.withSpan('root')(currentSentrySpan));

        expect(sentryCore.spanIsSampled(span)).toBe(true);
        expect(sentryCore.spanToJSON(span).parent_span_id).toBeUndefined();
      });
    });

    it('keeps a parentless Effect span in a trace the user continued', () => {
      sentryCore.continueTrace({ sentryTrace: `${traceId}-${spanId}-1`, baggage: undefined }, () => {
        const span = run(Effect.withSpan('handler')(currentSentrySpan));

        expect(sentryCore.spanToJSON(span)).toMatchObject({ trace_id: traceId, parent_span_id: spanId });
      });
    });

    if (variant === 'server') {
      it('starts a new trace for every parentless Effect span', () => {
        const processTraceId = sentryCore.getCurrentScope().getPropagationContext().traceId;
        const first = run(Effect.withSpan('first')(currentSentrySpan));
        const second = run(Effect.withSpan('second')(currentSentrySpan));

        expect(sentryCore.spanToJSON(first).trace_id).not.toBe(processTraceId);
        expect(sentryCore.spanToJSON(second).trace_id).not.toBe(processTraceId);
        expect(sentryCore.spanToJSON(first).trace_id).not.toBe(sentryCore.spanToJSON(second).trace_id);
      });
    } else {
      it('keeps parentless Effect spans in the page trace', () => {
        const pageTraceId = sentryCore.getCurrentScope().getPropagationContext().traceId;
        const first = run(Effect.withSpan('first')(currentSentrySpan));
        const second = run(Effect.withSpan('second')(currentSentrySpan));

        expect(sentryCore.spanToJSON(first).trace_id).toBe(pageTraceId);
        expect(sentryCore.spanToJSON(second).trace_id).toBe(pageTraceId);
      });
    }
  });
});
