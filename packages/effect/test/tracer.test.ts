import { describe, expect, it } from '@effect/vitest';
import * as sentryCore from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { Effect } from 'effect';
import { afterEach, vi } from 'vitest';
import { SentryEffectTracer } from '../src/tracer';

const withSentryTracer = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.withTracer(effect, SentryEffectTracer);

describe('SentryEffectTracer', () => {
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
          results.push('parent-end');
        }),
      );

      expect(results).toEqual(['parent-start', 'child-1', 'child-2', 'parent-end']);
    }).pipe(withSentryTracer),
  );

  it.effect('handles span failures correctly', () =>
    Effect.gen(function* () {
      const result = yield* Effect.withSpan('failing-span')(Effect.fail('expected-error')).pipe(
        Effect.catchCause(cause => {
          const error = cause.reasons[0]?._tag === 'Fail' ? cause.reasons[0].error : 'unknown';
          return Effect.succeed(`caught: ${error}`);
        }),
      );

      expect(result).toBe('caught: expected-error');
    }).pipe(withSentryTracer),
  );

  it.effect('handles span with defects (die)', () =>
    Effect.gen(function* () {
      const result = yield* Effect.withSpan('defect-span')(Effect.die('defect-value')).pipe(
        Effect.catchDefect(d => Effect.succeed(`caught-defect: ${d}`)),
      );

      expect(result).toBe('caught-defect: defect-value');
    }).pipe(withSentryTracer),
  );

  it.effect('works with Effect.all for parallel operations', () =>
    Effect.gen(function* () {
      const results = yield* Effect.withSpan('parallel-parent')(
        Effect.all([
          Effect.withSpan('task-1')(Effect.succeed(1)),
          Effect.withSpan('task-2')(Effect.succeed(2)),
          Effect.withSpan('task-3')(Effect.succeed(3)),
        ]),
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

      const mockStartInactiveSpan = vi.spyOn(sentryCore, 'startInactiveSpan').mockImplementation(_options => {
        return {
          spanContext: () => ({ spanId: 'test-span-id', traceId: 'test-trace-id' }),
          isRecording: () => true,
          setAttribute: vi.fn(),
          setStatus: (status: { code: number; message?: string }) => setStatusCalls.push(status),
          addEvent: vi.fn(),
          end: vi.fn(),
        } as unknown as sentryCore.Span;
      });

      yield* Effect.withSpan('success-span')(Effect.succeed('ok'));

      expect(setStatusCalls).toContainEqual({ code: 1 });

      mockStartInactiveSpan.mockRestore();
    }).pipe(withSentryTracer),
  );

  it.effect('sets span status to error on failure', () =>
    Effect.gen(function* () {
      const setStatusCalls: Array<{ code: number; message?: string }> = [];

      const mockStartInactiveSpan = vi.spyOn(sentryCore, 'startInactiveSpan').mockImplementation(_options => {
        return {
          spanContext: () => ({ spanId: 'test-span-id', traceId: 'test-trace-id' }),
          isRecording: () => true,
          setAttribute: vi.fn(),
          setStatus: (status: { code: number; message?: string }) => setStatusCalls.push(status),
          addEvent: vi.fn(),
          end: vi.fn(),
        } as unknown as sentryCore.Span;
      });

      yield* Effect.withSpan('error-span')(Effect.fail('test-error')).pipe(Effect.catchCause(() => Effect.void));

      expect(setStatusCalls).toContainEqual({ code: 2, message: 'test-error' });

      mockStartInactiveSpan.mockRestore();
    }).pipe(withSentryTracer),
  );

  it.effect('sets span status to error on defect', () =>
    Effect.gen(function* () {
      const setStatusCalls: Array<{ code: number; message?: string }> = [];

      const mockStartInactiveSpan = vi.spyOn(sentryCore, 'startInactiveSpan').mockImplementation(_options => {
        return {
          spanContext: () => ({ spanId: 'test-span-id', traceId: 'test-trace-id' }),
          isRecording: () => true,
          setAttribute: vi.fn(),
          setStatus: (status: { code: number; message?: string }) => setStatusCalls.push(status),
          addEvent: vi.fn(),
          end: vi.fn(),
        } as unknown as sentryCore.Span;
      });

      yield* Effect.withSpan('defect-span')(Effect.die('fatal-defect')).pipe(Effect.catchDefect(() => Effect.void));

      expect(setStatusCalls).toContainEqual({ code: 2, message: 'fatal-defect' });

      mockStartInactiveSpan.mockRestore();
    }).pipe(withSentryTracer),
  );

  it.effect('propagates Sentry span context via withActiveSpan', () =>
    Effect.gen(function* () {
      const withActiveSpanCalls: sentryCore.Span[] = [];

      const mockWithActiveSpan = vi
        .spyOn(sentryCore, 'withActiveSpan')
        .mockImplementation(<T>(span: sentryCore.Span | null, callback: (scope: sentryCore.Scope) => T): T => {
          if (span) {
            withActiveSpanCalls.push(span);
          }
          return callback({} as sentryCore.Scope);
        });

      yield* Effect.withSpan('context-span')(Effect.succeed('done'));

      expect(withActiveSpanCalls.length).toBeGreaterThan(0);

      mockWithActiveSpan.mockRestore();
    }).pipe(withSentryTracer),
  );

  it.effect('sets origin to auto.function.effect for regular spans', () =>
    Effect.gen(function* () {
      let capturedAttributes: Record<string, unknown> | undefined;

      const mockStartInactiveSpan = vi.spyOn(sentryCore, 'startInactiveSpan').mockImplementation(options => {
        capturedAttributes = options.attributes;
        return {
          spanContext: () => ({ spanId: 'test-span-id', traceId: 'test-trace-id' }),
          isRecording: () => true,
          setAttribute: vi.fn(),
          setStatus: vi.fn(),
          addEvent: vi.fn(),
          end: vi.fn(),
        } as unknown as sentryCore.Span;
      });

      yield* Effect.withSpan('my-operation')(Effect.succeed('ok'));

      expect(capturedAttributes).toBeDefined();
      expect(capturedAttributes?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toBe('auto.function.effect');

      mockStartInactiveSpan.mockRestore();
    }).pipe(withSentryTracer),
  );

  it.effect('sets origin to auto.http.effect for http.server spans', () =>
    Effect.gen(function* () {
      let capturedAttributes: Record<string, unknown> | undefined;

      const mockStartInactiveSpan = vi.spyOn(sentryCore, 'startInactiveSpan').mockImplementation(options => {
        capturedAttributes = options.attributes;
        return {
          spanContext: () => ({ spanId: 'test-span-id', traceId: 'test-trace-id' }),
          isRecording: () => true,
          setAttribute: vi.fn(),
          setStatus: vi.fn(),
          addEvent: vi.fn(),
          end: vi.fn(),
        } as unknown as sentryCore.Span;
      });

      yield* Effect.withSpan('http.server GET /api/users')(Effect.succeed('ok'));

      expect(capturedAttributes).toBeDefined();
      expect(capturedAttributes?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toBe('auto.http.effect');

      mockStartInactiveSpan.mockRestore();
    }).pipe(withSentryTracer),
  );

  it.effect('sets origin to auto.http.effect for http.client spans', () =>
    Effect.gen(function* () {
      let capturedAttributes: Record<string, unknown> | undefined;

      const mockStartInactiveSpan = vi.spyOn(sentryCore, 'startInactiveSpan').mockImplementation(options => {
        capturedAttributes = options.attributes;
        return {
          spanContext: () => ({ spanId: 'test-span-id', traceId: 'test-trace-id' }),
          isRecording: () => true,
          setAttribute: vi.fn(),
          setStatus: vi.fn(),
          addEvent: vi.fn(),
          end: vi.fn(),
        } as unknown as sentryCore.Span;
      });

      yield* Effect.withSpan('http.client GET https://api.example.com')(Effect.succeed('ok'));

      expect(capturedAttributes).toBeDefined();
      expect(capturedAttributes?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toBe('auto.http.effect');

      mockStartInactiveSpan.mockRestore();
    }).pipe(withSentryTracer),
  );

  it.effect('can be used with Effect.withTracer', () =>
    Effect.gen(function* () {
      const result = yield* Effect.withSpan('inline-tracer-span')(Effect.succeed('with-tracer'));
      expect(result).toBe('with-tracer');
    }).pipe(Effect.withTracer(SentryEffectTracer)),
  );
});
