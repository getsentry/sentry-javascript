import { describe, expect, it } from '@effect/vitest';
import * as sentryCore from '@sentry/core';
import { Effect, Logger } from 'effect';
import * as References from 'effect/References';
import { afterEach, vi } from 'vitest';
import { SentryEffectLogger } from '../src/logger';

vi.mock('@sentry/core', async importOriginal => {
  const original = await importOriginal<typeof sentryCore>();
  return {
    ...original,
    logger: {
      ...original.logger,
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
    },
  };
});

const LOG_ATTRIBUTES = { 'sentry.origin': 'auto.log.effect' };

describe('SentryEffectLogger', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const loggerLayer = Logger.layer([SentryEffectLogger]);

  const withAllLogLevels = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provideService(effect, References.MinimumLogLevel, 'All');

  it.effect('forwards fatal logs to Sentry', () =>
    Effect.gen(function* () {
      yield* Effect.logFatal('This is a fatal message');
      expect(sentryCore.logger.fatal).toHaveBeenCalledWith('This is a fatal message', LOG_ATTRIBUTES);
    }).pipe(Effect.provide(loggerLayer)),
  );

  it.effect('forwards error logs to Sentry', () =>
    Effect.gen(function* () {
      yield* Effect.logError('This is an error message');
      expect(sentryCore.logger.error).toHaveBeenCalledWith('This is an error message', LOG_ATTRIBUTES);
    }).pipe(Effect.provide(loggerLayer)),
  );

  it.effect('forwards warning logs to Sentry', () =>
    Effect.gen(function* () {
      yield* Effect.logWarning('This is a warning message');
      expect(sentryCore.logger.warn).toHaveBeenCalledWith('This is a warning message', LOG_ATTRIBUTES);
    }).pipe(Effect.provide(loggerLayer)),
  );

  it.effect('forwards info logs to Sentry', () =>
    Effect.gen(function* () {
      yield* Effect.logInfo('This is an info message');
      expect(sentryCore.logger.info).toHaveBeenCalledWith('This is an info message', LOG_ATTRIBUTES);
    }).pipe(Effect.provide(loggerLayer)),
  );

  it.effect('forwards debug logs to Sentry', () =>
    Effect.gen(function* () {
      yield* Effect.logDebug('This is a debug message');
      expect(sentryCore.logger.debug).toHaveBeenCalledWith('This is a debug message', LOG_ATTRIBUTES);
    }).pipe(withAllLogLevels, Effect.provide(loggerLayer)),
  );

  it.effect('forwards trace logs to Sentry', () =>
    Effect.gen(function* () {
      yield* Effect.logTrace('This is a trace message');
      expect(sentryCore.logger.trace).toHaveBeenCalledWith('This is a trace message', LOG_ATTRIBUTES);
    }).pipe(withAllLogLevels, Effect.provide(loggerLayer)),
  );

  it.effect('handles object messages by stringifying', () =>
    Effect.gen(function* () {
      yield* Effect.logInfo({ key: 'value', nested: { foo: 'bar' } });
      expect(sentryCore.logger.info).toHaveBeenCalledWith('{"key":"value","nested":{"foo":"bar"}}', LOG_ATTRIBUTES);
    }).pipe(Effect.provide(loggerLayer)),
  );

  it.effect('handles multiple log calls', () =>
    Effect.gen(function* () {
      yield* Effect.logInfo('First message');
      yield* Effect.logInfo('Second message');
      yield* Effect.logWarning('Third message');
      expect(sentryCore.logger.info).toHaveBeenCalledTimes(2);
      expect(sentryCore.logger.info).toHaveBeenNthCalledWith(1, 'First message', LOG_ATTRIBUTES);
      expect(sentryCore.logger.info).toHaveBeenNthCalledWith(2, 'Second message', LOG_ATTRIBUTES);
      expect(sentryCore.logger.warn).toHaveBeenCalledWith('Third message', LOG_ATTRIBUTES);
    }).pipe(Effect.provide(loggerLayer)),
  );

  it.effect('works with Effect.tap for logging side effects', () =>
    Effect.gen(function* () {
      const result = yield* Effect.succeed('data').pipe(
        Effect.tap(data => Effect.logInfo(`Processing: ${data}`)),
        Effect.map(d => d.toUpperCase()),
      );
      expect(result).toBe('DATA');
      expect(sentryCore.logger.info).toHaveBeenCalledWith('Processing: data', LOG_ATTRIBUTES);
    }).pipe(Effect.provide(loggerLayer)),
  );

  it.effect('sets the sentry.origin attribute on every log level', () =>
    Effect.gen(function* () {
      yield* Effect.logFatal('fatal');
      yield* Effect.logError('error');
      yield* Effect.logWarning('warning');
      yield* Effect.logInfo('info');
      yield* Effect.logDebug('debug');
      yield* Effect.logTrace('trace');

      for (const level of ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const) {
        expect(sentryCore.logger[level]).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ 'sentry.origin': 'auto.log.effect' }),
        );
      }
    }).pipe(withAllLogLevels, Effect.provide(loggerLayer)),
  );
});
