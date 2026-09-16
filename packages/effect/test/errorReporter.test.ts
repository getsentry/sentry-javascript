import { describe, expect, it } from '@effect/vitest';
import type { Event } from '@sentry/core';
import { getClient, getMainCarrier } from '@sentry/core';
import { Cause, Data, Effect, ErrorReporter, Layer } from 'effect';
import { afterEach, beforeEach, vi } from 'vitest';
import * as sentryClient from '../src/index.client';
import * as sentryServer from '../src/index.server';

const TEST_DSN = 'https://username@domain/123';

class IgnoredError extends Data.TaggedError('IgnoredError')<{ readonly reason: string }> {
  readonly [ErrorReporter.ignore] = true;
}

class RateLimitError extends Data.TaggedError('RateLimitError')<{ readonly retryAfter: number }> {
  readonly [ErrorReporter.severity] = 'Warn' as const;
  readonly [ErrorReporter.attributes] = { retryAfter: this.retryAfter };
}

class FatalError extends Data.TaggedError('FatalError')<{ readonly message: string }> {
  readonly [ErrorReporter.severity] = 'Fatal' as const;
}

describe.each([
  [{ subSdkName: 'browser', effectLayer: sentryClient.effectLayer }],
  [{ subSdkName: 'node', effectLayer: sentryServer.effectLayer }],
])('Sentry ErrorReporter ($subSdkName)', ({ effectLayer }) => {
  let events: Event[];

  function makeLayer(): Layer.Layer<never> {
    return effectLayer({
      dsn: TEST_DSN,
      transport: () => ({
        send: vi.fn().mockResolvedValue({}),
        flush: vi.fn().mockResolvedValue(true),
      }),
      beforeSend: event => {
        events.push(event);
        return event;
      },
    });
  }

  const flush = Effect.promise(() => getClient()!.flush(1000));

  beforeEach(() => {
    events = [];
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.effect('captures Effect.fail errors reported through withErrorReporting', () =>
    Effect.gen(function* () {
      yield* Effect.fail(new Error('Effect failure')).pipe(Effect.withErrorReporting, Effect.exit);
      yield* flush;

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(
        expect.objectContaining({
          level: 'error',
          exception: {
            values: [
              expect.objectContaining({
                type: 'Error',
                value: 'Effect failure',
                mechanism: { type: 'auto.function.effect.error_reporter', handled: false },
                stacktrace: expect.objectContaining({
                  frames: expect.arrayContaining([expect.objectContaining({ filename: expect.any(String) })]),
                }),
              }),
            ],
          },
        }),
      );
    }).pipe(Effect.provide(makeLayer())),
  );

  it.effect('captures Effect.die defects', () =>
    Effect.gen(function* () {
      yield* Effect.die(new TypeError('Effect defect')).pipe(Effect.withErrorReporting, Effect.exit);
      yield* flush;

      expect(events).toHaveLength(1);
      expect(events[0]?.exception?.values?.[0]).toEqual(
        expect.objectContaining({ type: 'TypeError', value: 'Effect defect' }),
      );
    }).pipe(Effect.provide(makeLayer())),
  );

  it.effect('captures non-error values', () =>
    Effect.gen(function* () {
      yield* Effect.die('plain defect').pipe(Effect.withErrorReporting, Effect.exit);
      yield* flush;

      expect(events).toHaveLength(1);
      expect(events[0]?.exception?.values?.[0]?.value).toBe('plain defect');
      expect(events[0]?.level).toBe('error');
    }).pipe(Effect.provide(makeLayer())),
  );

  it.effect('captures causes reported with ErrorReporter.report', () =>
    Effect.gen(function* () {
      yield* ErrorReporter.report(Cause.fail(new Error('Manually reported')));
      yield* flush;

      expect(events).toHaveLength(1);
      expect(events[0]?.exception?.values?.[0]?.value).toBe('Manually reported');
    }).pipe(Effect.provide(makeLayer())),
  );

  it.effect('skips errors annotated with ErrorReporter.ignore', () =>
    Effect.gen(function* () {
      yield* Effect.fail(new IgnoredError({ reason: 'expected' })).pipe(Effect.withErrorReporting, Effect.exit);
      yield* Effect.fail(new Error('Sentinel')).pipe(Effect.withErrorReporting, Effect.exit);
      yield* flush;

      expect(events).toHaveLength(1);
      expect(events[0]?.exception?.values?.[0]?.value).toBe('Sentinel');
    }).pipe(Effect.provide(makeLayer())),
  );

  it.effect('skips interruptions', () =>
    Effect.gen(function* () {
      yield* Effect.interrupt.pipe(Effect.withErrorReporting, Effect.exit);
      yield* Effect.fail(new Error('Sentinel')).pipe(Effect.withErrorReporting, Effect.exit);
      yield* flush;

      expect(events).toHaveLength(1);
      expect(events[0]?.exception?.values?.[0]?.value).toBe('Sentinel');
    }).pipe(Effect.provide(makeLayer())),
  );

  it.effect('maps the severity annotation to the event level', () =>
    Effect.gen(function* () {
      yield* Effect.fail(new RateLimitError({ retryAfter: 60 })).pipe(Effect.withErrorReporting, Effect.exit);
      yield* Effect.fail(new FatalError({ message: 'disk gone' })).pipe(Effect.withErrorReporting, Effect.exit);
      yield* flush;

      expect(events).toHaveLength(2);
      expect(events[0]?.level).toBe('warning');
      expect(events[0]?.exception?.values?.[0]?.type).toBe('RateLimitError');
      expect(events[1]?.level).toBe('fatal');
      expect(events[1]?.exception?.values?.[0]?.type).toBe('FatalError');
    }).pipe(Effect.provide(makeLayer())),
  );

  it.effect('forwards the attributes annotation as extra data', () =>
    Effect.gen(function* () {
      yield* Effect.fail(new RateLimitError({ retryAfter: 60 })).pipe(Effect.withErrorReporting, Effect.exit);
      yield* flush;

      expect(events).toHaveLength(1);
      expect(events[0]?.extra).toEqual({ retryAfter: 60 });
    }).pipe(Effect.provide(makeLayer())),
  );

  it.effect('reports the same error only once', () =>
    Effect.gen(function* () {
      const error = new Error('Reported twice');
      yield* Effect.fail(error).pipe(Effect.withErrorReporting, Effect.withErrorReporting, Effect.exit);
      yield* Effect.fail(error).pipe(Effect.withErrorReporting, Effect.exit);
      yield* flush;

      expect(events).toHaveLength(1);
    }).pipe(Effect.provide(makeLayer())),
  );

  it.effect('keeps reporters registered before the Sentry layer', () =>
    Effect.gen(function* () {
      const userReporter = vi.fn();

      yield* Effect.fail(new Error('Shared failure')).pipe(
        Effect.withErrorReporting,
        Effect.exit,
        Effect.provide(makeLayer().pipe(Layer.provide(ErrorReporter.layer([ErrorReporter.make(userReporter)])))),
      );
      yield* flush;

      expect(userReporter).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: 'Shared failure' }) }),
      );
      expect(events).toHaveLength(1);
      expect(events[0]?.exception?.values?.[0]?.value).toBe('Shared failure');
    }),
  );

  it.effect('attaches the error to the active span', () =>
    Effect.gen(function* () {
      yield* Effect.fail(new Error('Failure in span')).pipe(
        Effect.withErrorReporting,
        Effect.exit,
        Effect.withSpan('failing-operation'),
      );
      yield* flush;

      expect(events).toHaveLength(1);
      expect(events[0]?.contexts?.trace?.trace_id).toEqual(expect.any(String));
    }).pipe(
      Effect.withTracer(sentryServer.SentryEffectTracer),
      Effect.provide(
        effectLayer({
          dsn: TEST_DSN,
          tracesSampleRate: 1,
          transport: () => ({
            send: vi.fn().mockResolvedValue({}),
            flush: vi.fn().mockResolvedValue(true),
          }),
          beforeSend: event => {
            events.push(event);
            return event;
          },
        }),
      ),
    ),
  );
});
