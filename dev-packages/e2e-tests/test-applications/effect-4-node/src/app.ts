import * as Sentry from '@sentry/effect';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import * as Effect from 'effect/Effect';
import * as Cause from 'effect/Cause';
import * as Data from 'effect/Data';
import * as ErrorReporter from 'effect/ErrorReporter';
import * as Fiber from 'effect/Fiber';
import * as Layer from 'effect/Layer';
import * as Metric from 'effect/Metric';
import * as Tracer from 'effect/Tracer';
import * as References from 'effect/References';
import { HttpRouter, HttpServerResponse } from 'effect/http';
import { createServer } from 'http';

const SentryLayer = Layer.mergeAll(
  Sentry.layer({
    dsn: process.env.E2E_TEST_DSN,
    environment: 'qa',
    debug: !!process.env.DEBUG,
    tunnel: 'http://localhost:3031/',
    tracesSampleRate: 1,
  }),
  Sentry.layerLogger,
  Sentry.layerTracer,
  Sentry.layerMetrics,
  Layer.succeed(References.MinimumLogLevel, 'Debug'),
);

const ordersPlaced = Metric.counter('orders_placed', { attributes: { shop: 'e2e' } });
const queueDepth = Metric.gauge('queue_depth');
const requestDuration = Metric.histogram('request_duration_ms', {
  boundaries: Metric.linearBoundaries({ start: 0, width: 50, count: 10 }),
});
const cacheLookups = Metric.frequency('cache_lookups');

class NotFoundError extends Data.TaggedError('NotFoundError')<{ readonly id: string }> {
  readonly [ErrorReporter.ignore] = true;
}

class RateLimitError extends Data.TaggedError('RateLimitError')<{ readonly retryAfter: number }> {
  readonly [ErrorReporter.severity] = 'Warn' as const;
  readonly [ErrorReporter.attributes] = { retryAfter: this.retryAfter };
}

function loadUser(id: string): Effect.Effect<never, Error> {
  return Effect.fail(new Error(`User ${id} could not be loaded`));
}

const Routes = Layer.mergeAll(
  HttpRouter.add('GET', '/test-success', HttpServerResponse.json({ version: 'v1' })),

  HttpRouter.add(
    'GET',
    '/test-error-reporter/unhandled/:id',
    Effect.gen(function* () {
      const params = yield* HttpRouter.params;
      yield* loadUser(params.id ?? 'unknown');
      return HttpServerResponse.empty();
    }),
  ),

  HttpRouter.add(
    'GET',
    '/test-error-reporter/handled',
    Effect.gen(function* () {
      yield* Effect.fail(new Error('Handled after reporting'));
      return HttpServerResponse.empty();
    }).pipe(
      Effect.withErrorReporting,
      Effect.catch(() => HttpServerResponse.json({ recovered: true })),
    ),
  ),

  HttpRouter.add(
    'GET',
    '/test-error-reporter/ignored',
    Effect.gen(function* () {
      yield* Effect.fail(new NotFoundError({ id: 'missing' }));
      return HttpServerResponse.empty();
    }),
  ),

  HttpRouter.add(
    'GET',
    '/test-error-reporter/annotated',
    Effect.gen(function* () {
      yield* Effect.fail(new RateLimitError({ retryAfter: 60 }));
      return HttpServerResponse.empty();
    }),
  ),

  HttpRouter.add(
    'GET',
    '/test-transaction',
    Effect.gen(function* () {
      yield* Effect.void.pipe(Effect.withSpan('test-span'));
      return yield* HttpServerResponse.json({ status: 'ok' });
    }),
  ),

  HttpRouter.add(
    'GET',
    '/test-effect-span',
    Effect.gen(function* () {
      yield* Effect.gen(function* () {
        yield* Effect.sleep('50 millis');
        yield* Effect.sleep('25 millis').pipe(Effect.withSpan('nested-span'));
      }).pipe(Effect.withSpan('custom-effect-span', { kind: 'internal' }));
      return yield* HttpServerResponse.json({ status: 'ok' });
    }),
  ),

  HttpRouter.add(
    'GET',
    '/test-root-span',
    Effect.gen(function* () {
      yield* Effect.void.pipe(Effect.withSpan('root-span-request-marker'));
      yield* Effect.sleep('10 millis').pipe(Effect.withSpan('detached-root-span', { root: true }));
      return yield* HttpServerResponse.json({ status: 'ok' });
    }),
  ),

  HttpRouter.add(
    'GET',
    '/test-external-parent',
    Effect.gen(function* () {
      yield* Effect.sleep('10 millis').pipe(
        Effect.withSpan('continued-span', {
          parent: Tracer.externalSpan({
            traceId: 'fedcba0987654321fedcba0987654321',
            spanId: '0987654321fedcba',
            sampled: true,
          }),
        }),
      );
      return yield* HttpServerResponse.json({ status: 'ok' });
    }).pipe(Effect.provide(Sentry.layerExternalSpan)),
  ),

  HttpRouter.add(
    'GET',
    '/test-error',
    Effect.gen(function* () {
      const exceptionId = Sentry.captureException(new Error('This is an error'));
      yield* Effect.promise(() => Sentry.flush(2000));
      return yield* HttpServerResponse.json({ exceptionId });
    }),
  ),

  HttpRouter.add(
    'GET',
    '/test-exception/:id',
    Effect.gen(function* () {
      yield* Effect.sync(() => {
        throw new Error('This is an exception with id 123');
      });
      return HttpServerResponse.empty();
    }).pipe(
      Effect.catchCause(cause => {
        const error = Cause.squash(cause);
        Sentry.captureException(error);
        return Effect.gen(function* () {
          yield* Effect.promise(() => Sentry.flush(2000));
          return yield* HttpServerResponse.json({ error: String(error) }, { status: 500 });
        });
      }),
    ),
  ),

  HttpRouter.add(
    'GET',
    '/test-effect-fail',
    Effect.gen(function* () {
      yield* Effect.fail(new Error('Effect failure'));
      return HttpServerResponse.empty();
    }).pipe(
      Effect.catchCause(cause => {
        const error = Cause.squash(cause);
        Sentry.captureException(error);
        return Effect.gen(function* () {
          yield* Effect.promise(() => Sentry.flush(2000));
          return yield* HttpServerResponse.json({ error: String(error) }, { status: 500 });
        });
      }),
    ),
  ),

  HttpRouter.add(
    'GET',
    '/test-effect-die',
    Effect.gen(function* () {
      yield* Effect.die('Effect defect');
      return HttpServerResponse.empty();
    }).pipe(
      Effect.catchCause(cause => {
        const error = Cause.squash(cause);
        Sentry.captureException(error);
        return Effect.gen(function* () {
          yield* Effect.promise(() => Sentry.flush(2000));
          return yield* HttpServerResponse.json({ error: String(error) }, { status: 500 });
        });
      }),
    ),
  ),

  HttpRouter.add(
    'GET',
    '/test-log',
    Effect.gen(function* () {
      yield* Effect.logDebug('Debug log from Effect');
      yield* Effect.logInfo('Info log from Effect');
      yield* Effect.logWarning('Warning log from Effect');
      yield* Effect.logError('Error log from Effect');
      return yield* HttpServerResponse.json({ message: 'Logs sent' });
    }),
  ),

  HttpRouter.add(
    'GET',
    '/test-log-with-context',
    Effect.gen(function* () {
      yield* Effect.logInfo('Log with context').pipe(
        Effect.annotateLogs('userId', '12345'),
        Effect.annotateLogs('action', 'test'),
      );
      return yield* HttpServerResponse.json({ message: 'Log with context sent' });
    }),
  ),

  HttpRouter.add(
    'GET',
    '/test-metric-counter',
    Effect.gen(function* () {
      yield* Metric.update(ordersPlaced, 1);
      return yield* HttpServerResponse.json({ status: 'ok' });
    }),
  ),

  HttpRouter.add(
    'GET',
    '/test-metrics',
    Effect.gen(function* () {
      yield* Metric.update(queueDepth, 7);
      yield* Metric.update(requestDuration, 120);
      yield* Metric.update(requestDuration, 80);
      yield* Metric.update(cacheLookups, 'hit');
      yield* Metric.update(cacheLookups, 'hit');
      yield* Metric.update(cacheLookups, 'miss');
      return yield* HttpServerResponse.json({ status: 'ok' });
    }),
  ),

  HttpRouter.add(
    'GET',
    '/test-runtime-metrics',
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(Effect.sleep('10 millis'));
      yield* Fiber.join(fiber);
      return yield* HttpServerResponse.json({ status: 'ok' });
    }).pipe(Metric.enableRuntimeMetrics),
  ),
);

const HttpLayer = HttpRouter.serve(Routes).pipe(
  Layer.provide(NodeHttpServer.layer(() => createServer(), { port: 3030 })),
  Layer.provide(SentryLayer),
);

NodeRuntime.runMain(Layer.launch(HttpLayer));
