import { HttpApiBuilder } from '@effect/platform';
import { Effect, Metric } from 'effect';
import { Api } from '../Api.js';

const requestCounter = Metric.counter('http_requests_total').pipe(Metric.withConstantInput(1));

export const HttpTestLive = HttpApiBuilder.group(Api, 'test', handlers =>
  Effect.gen(function* () {
    return handlers
      .handle('success', () => Effect.succeed({ status: 'ok' }))

      .handle('effectSpan', () =>
        Effect.gen(function* () {
          yield* Effect.log('Starting effect span test');
          yield* Effect.sleep('10 millis');
          return { status: 'ok' };
        }).pipe(Effect.withSpan('test-effect-span')),
      )

      .handle('nestedSpans', () => {
        const innerEffect = Effect.gen(function* () {
          yield* Effect.sleep('5 millis');
          return 'inner-result';
        }).pipe(Effect.withSpan('inner-span'));

        return Effect.gen(function* () {
          const result = yield* innerEffect;
          yield* Effect.sleep('5 millis');
          return { result };
        }).pipe(Effect.withSpan('outer-span'));
      })

      .handle('effectError', () =>
        Effect.gen(function* () {
          yield* Effect.fail(new Error('Effect error'));
          return { error: '' };
        }).pipe(
          Effect.withSpan('error-span'),
          Effect.catchAll(error => Effect.succeed({ error: error instanceof Error ? error.message : String(error) })),
        ),
      )

      .handle('effectLog', () =>
        Effect.gen(function* () {
          yield* Effect.log('Test info log message');
          yield* Effect.logDebug('Test debug log message');
          yield* Effect.logWarning('Test warning log message');
          yield* Effect.logError('Test error log message');
          return { logged: true };
        }),
      )

      .handle('effectMetric', () =>
        Effect.gen(function* () {
          yield* Metric.increment(requestCounter);
          yield* Metric.increment(requestCounter);
          yield* Metric.increment(requestCounter);
          return { incremented: 3 };
        }),
      )

      .handle('effectWithHttp', () =>
        Effect.gen(function* () {
          yield* Effect.log('Processing request');
          yield* Effect.sleep('10 millis');
          return { status: 'ok' };
        }).pipe(Effect.withSpan('process-request', { kind: 'server' })),
      );
  }),
);
