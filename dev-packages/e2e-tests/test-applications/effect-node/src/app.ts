import * as Sentry from '@sentry/effect/server';
import { HttpRouter, HttpServer, HttpServerResponse } from '@effect/platform';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { Cause, Effect, Layer, Logger, LogLevel } from 'effect';
import { createServer } from 'http';

const SentryLive = Sentry.effectLayer({
  dsn: process.env.E2E_TEST_DSN,
  environment: 'qa',
  debug: !!process.env.DEBUG,
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1,
  enableLogs: true,
});

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

  HttpRouter.catchAllCause(cause => {
    const error = Cause.squash(cause);
    Sentry.captureException(error);
    return Effect.gen(function* () {
      yield* Effect.promise(() => Sentry.flush(2000));
      return yield* HttpServerResponse.json({ error: String(error) }, { status: 500 });
    });
  }),
);

const LogLevelLive = Logger.minimumLogLevel(LogLevel.Debug);

const ServerLive = router.pipe(
  HttpServer.serve(),
  HttpServer.withLogAddress,
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3030 })),
  Layer.provide(SentryLive),
  Layer.provide(LogLevelLive),
);

ServerLive.pipe(Layer.launch, NodeRuntime.runMain);
