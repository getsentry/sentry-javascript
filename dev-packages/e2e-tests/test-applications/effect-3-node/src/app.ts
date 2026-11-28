import * as Sentry from '@sentry/effect';
import { HttpRouter, HttpServer, HttpServerResponse } from '@effect/platform';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import * as Effect from 'effect/Effect';
import * as Cause from 'effect/Cause';
import * as Layer from 'effect/Layer';
import * as Logger from 'effect/Logger';
import * as LogLevel from 'effect/LogLevel';
import * as Metric from 'effect/Metric';
import * as MetricBoundaries from 'effect/MetricBoundaries';
import * as Tracer from 'effect/Tracer';
import { createServer } from 'http';

const SentryLayer = Layer.mergeAll(
  Sentry.layer({
    dsn: process.env.E2E_TEST_DSN,
    environment: 'qa',
    debug: !!process.env.DEBUG,
    tunnel: 'http://localhost:3031/',
    tracesSampleRate: 1,
  }),
  Sentry.layerTracer,
  Sentry.layerLogger,
  Sentry.layerMetrics,
);

const ordersPlaced = Metric.counter('orders_placed').pipe(Metric.tagged('shop', 'e2e'));
const queueDepth = Metric.gauge('queue_depth');
const requestDuration = Metric.histogram(
  'request_duration_ms',
  MetricBoundaries.linear({ start: 0, width: 50, count: 10 }),
);
const cacheLookups = Metric.frequency('cache_lookups');

const router = HttpRouter.empty.pipe(
  HttpRouter.get('/test-success', HttpServerResponse.json({ version: 'v1' })),

  HttpRouter.get(
    '/test-transaction',
    Effect.gen(function* () {
      yield* Effect.void.pipe(Effect.withSpan('test-span'));
      return yield* HttpServerResponse.json({ status: 'ok' });
    }),
  ),

  HttpRouter.get(
    '/test-effect-span',
    Effect.gen(function* () {
      yield* Effect.gen(function* () {
        yield* Effect.sleep('50 millis');
        yield* Effect.sleep('25 millis').pipe(Effect.withSpan('nested-span'));
      }).pipe(Effect.withSpan('custom-effect-span', { kind: 'internal' }));
      return yield* HttpServerResponse.json({ status: 'ok' });
    }),
  ),

  HttpRouter.get(
    '/test-root-span',
    Effect.gen(function* () {
      yield* Effect.void.pipe(Effect.withSpan('root-span-request-marker'));
      yield* Effect.sleep('10 millis').pipe(Effect.withSpan('detached-root-span', { root: true }));
      return yield* HttpServerResponse.json({ status: 'ok' });
    }),
  ),

  HttpRouter.get(
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

  HttpRouter.get(
    '/test-error',
    Effect.gen(function* () {
      const exceptionId = Sentry.captureException(new Error('This is an error'));
      yield* Effect.promise(() => Sentry.flush(2000));
      return yield* HttpServerResponse.json({ exceptionId });
    }),
  ),

  HttpRouter.get(
    '/test-exception/:id',
    Effect.sync(() => {
      throw new Error('This is an exception with id 123');
    }),
  ),

  HttpRouter.get('/test-effect-fail', Effect.fail(new Error('Effect failure'))),

  HttpRouter.get('/test-effect-die', Effect.die('Effect defect')),

  HttpRouter.get(
    '/test-log',
    Effect.gen(function* () {
      yield* Effect.logDebug('Debug log from Effect');
      yield* Effect.logInfo('Info log from Effect');
      yield* Effect.logWarning('Warning log from Effect');
      yield* Effect.logError('Error log from Effect');
      return yield* HttpServerResponse.json({ message: 'Logs sent' });
    }),
  ),

  HttpRouter.get(
    '/test-log-with-context',
    Effect.gen(function* () {
      yield* Effect.logInfo('Log with context').pipe(
        Effect.annotateLogs('userId', '12345'),
        Effect.annotateLogs('action', 'test'),
      );
      return yield* HttpServerResponse.json({ message: 'Log with context sent' });
    }),
  ),

  HttpRouter.get(
    '/test-metric-counter',
    Effect.gen(function* () {
      yield* Metric.update(ordersPlaced, 1);
      return yield* HttpServerResponse.json({ status: 'ok' });
    }),
  ),

  HttpRouter.get(
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

  HttpRouter.catchAllCause(cause => {
    const error = Cause.squash(cause);
    Sentry.captureException(error);
    return Effect.gen(function* () {
      yield* Effect.promise(() => Sentry.flush(2000));
      return yield* HttpServerResponse.json({ error: String(error) }, { status: 500 });
    });
  }),
);

const LogLevelLayer = Logger.minimumLogLevel(LogLevel.Debug);

const ServerLayer = router.pipe(
  HttpServer.serve(),
  HttpServer.withLogAddress,
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3030 })),
  Layer.provide(SentryLayer),
  Layer.provide(LogLevelLayer),
);

ServerLayer.pipe(Layer.launch, NodeRuntime.runMain);
