import * as Sentry from '@sentry/effect';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import * as Effect from 'effect/Effect';
import * as Cause from 'effect/Cause';
import * as Layer from 'effect/Layer';
import * as Logger from 'effect/Logger';
import * as Tracer from 'effect/Tracer';
import * as References from 'effect/References';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';
import { createServer } from 'http';

const SentryLive = Layer.mergeAll(
  Sentry.effectLayer({
    dsn: process.env.E2E_TEST_DSN,
    environment: 'qa',
    debug: !!process.env.DEBUG,
    tunnel: 'http://localhost:3031/',
    tracesSampleRate: 1,
    enableLogs: true,
  }),
  Logger.layer([Sentry.SentryEffectLogger]),
  Layer.succeed(Tracer.Tracer, Sentry.SentryEffectTracer),
  Layer.succeed(References.MinimumLogLevel, 'Debug'),
);

const Routes = Layer.mergeAll(
  HttpRouter.add('GET', '/test-success', HttpServerResponse.json({ version: 'v1' })),

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
);

const HttpLive = HttpRouter.serve(Routes).pipe(
  Layer.provide(NodeHttpServer.layer(() => createServer(), { port: 3030 })),
  Layer.provide(SentryLive),
);

NodeRuntime.runMain(Layer.launch(HttpLive));
