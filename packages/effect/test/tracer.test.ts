import { describe, expect, it } from '@effect/vitest';
import * as sentryCore from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { Effect } from 'effect';
import { afterEach, vi } from 'vitest';
import { SentryEffectTracerLayer } from '../src/tracer';

describe('SentryEffectTracerLayer', () => {
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
    }).pipe(Effect.provide(SentryEffectTracerLayer)),
  );

  it.effect('creates spans with correct attributes', () =>
    Effect.gen(function* () {
      const result = yield* Effect.withSpan('my-operation')(Effect.succeed('success'));

      expect(result).toBe('success');
    }).pipe(Effect.provide(SentryEffectTracerLayer)),
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
    }).pipe(Effect.provide(SentryEffectTracerLayer)),
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
    }).pipe(Effect.provide(SentryEffectTracerLayer)),
  );

  it.effect('handles span failures correctly', () =>
    Effect.gen(function* () {
      const result = yield* Effect.withSpan('failing-span')(Effect.fail('expected-error')).pipe(
        Effect.catchAll(e => Effect.succeed(`caught: ${e}`)),
      );

      expect(result).toBe('caught: expected-error');
    }).pipe(Effect.provide(SentryEffectTracerLayer)),
  );

  it.effect('handles span with defects (die)', () =>
    Effect.gen(function* () {
      const result = yield* Effect.withSpan('defect-span')(Effect.die('defect-value')).pipe(
        Effect.catchAllDefect(d => Effect.succeed(`caught-defect: ${d}`)),
      );

      expect(result).toBe('caught-defect: defect-value');
    }).pipe(Effect.provide(SentryEffectTracerLayer)),
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
    }).pipe(Effect.provide(SentryEffectTracerLayer)),
  );

  it.effect('supports span annotations', () =>
    Effect.gen(function* () {
      const result = yield* Effect.succeed('annotated').pipe(
        Effect.withSpan('annotated-span'),
        Effect.tap(() => Effect.annotateCurrentSpan('custom-key', 'custom-value')),
      );

      expect(result).toBe('annotated');
    }).pipe(Effect.provide(SentryEffectTracerLayer)),
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
    }).pipe(Effect.provide(SentryEffectTracerLayer)),
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

      yield* Effect.withSpan('error-span')(Effect.fail('test-error')).pipe(Effect.catchAll(() => Effect.void));

      expect(setStatusCalls).toContainEqual({ code: 2, message: 'test-error' });

      mockStartInactiveSpan.mockRestore();
    }).pipe(Effect.provide(SentryEffectTracerLayer)),
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

      yield* Effect.withSpan('defect-span')(Effect.die('fatal-defect')).pipe(Effect.catchAllDefect(() => Effect.void));

      expect(setStatusCalls).toContainEqual({ code: 2, message: 'fatal-defect' });

      mockStartInactiveSpan.mockRestore();
    }).pipe(Effect.provide(SentryEffectTracerLayer)),
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
    }).pipe(Effect.provide(SentryEffectTracerLayer)),
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
    }).pipe(Effect.provide(SentryEffectTracerLayer)),
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
    }).pipe(Effect.provide(SentryEffectTracerLayer)),
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
    }).pipe(Effect.provide(SentryEffectTracerLayer)),
  );

  it.effect('uses transaction name from isolation scope for http.server spans', () =>
    Effect.gen(function* () {
      let capturedSpanName: string | undefined;

      const mockGetIsolationScope = vi.spyOn(sentryCore, 'getIsolationScope').mockReturnValue({
        getScopeData: () => ({
          transactionName: 'GET /users/:id',
        }),
      } as unknown as sentryCore.Scope);

      const mockStartInactiveSpan = vi.spyOn(sentryCore, 'startInactiveSpan').mockImplementation(options => {
        capturedSpanName = options.name;
        return {
          spanContext: () => ({ spanId: 'test-span-id', traceId: 'test-trace-id' }),
          isRecording: () => true,
          setAttribute: vi.fn(),
          setStatus: vi.fn(),
          addEvent: vi.fn(),
          end: vi.fn(),
        } as unknown as sentryCore.Span;
      });

      yield* Effect.withSpan('http.server GET /users/123', { kind: 'server' })(Effect.succeed('ok'));

      expect(capturedSpanName).toBe('GET /users/:id');

      mockStartInactiveSpan.mockRestore();
      mockGetIsolationScope.mockRestore();
    }).pipe(Effect.provide(SentryEffectTracerLayer)),
  );
});
