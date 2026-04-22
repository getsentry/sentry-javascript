import { describe, expect, it } from '@effect/vitest';
import * as sentryCore from '@sentry/core';
import { getClient, getCurrentScope, getIsolationScope, SDK_VERSION } from '@sentry/core';
import { Effect, Layer, Logger } from 'effect';
import * as References from 'effect/References';
import { afterEach, beforeEach, vi } from 'vitest';
import * as sentryClient from '../src/index.client';
import * as sentryServer from '../src/index.server';

const TEST_DSN = 'https://username@domain/123';

function getMockTransport() {
  return () => ({
    send: vi.fn().mockResolvedValue({}),
    flush: vi.fn().mockResolvedValue(true),
  });
}

describe.each([
  [
    {
      subSdkName: 'browser',
      effectLayer: sentryClient.effectLayer,
      SentryEffectTracer: sentryClient.SentryEffectTracer,
      SentryEffectLogger: sentryClient.SentryEffectLogger,
      SentryEffectMetricsLayer: sentryClient.SentryEffectMetricsLayer,
    },
  ],
  [
    {
      subSdkName: 'node-light',
      effectLayer: sentryServer.effectLayer,
      SentryEffectTracer: sentryServer.SentryEffectTracer,
      SentryEffectLogger: sentryServer.SentryEffectLogger,
      SentryEffectMetricsLayer: sentryServer.SentryEffectMetricsLayer,
    },
  ],
])('effectLayer ($subSdkName)', ({ subSdkName, effectLayer, SentryEffectTracer, SentryEffectLogger }) => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
  });

  afterEach(() => {
    getCurrentScope().setClient(undefined);
    vi.restoreAllMocks();
  });

  it('creates a valid Effect layer', () => {
    const layer = effectLayer({
      dsn: TEST_DSN,
      transport: getMockTransport(),
    });

    expect(layer).toBeDefined();
    expect(Layer.isLayer(layer)).toBe(true);
  });

  it.effect('applies SDK metadata', () =>
    Effect.gen(function* () {
      yield* Effect.void;

      const client = getClient();
      const metadata = client?.getOptions()._metadata?.sdk;

      expect(metadata?.name).toBe('sentry.javascript.effect');
      expect(metadata?.packages).toEqual([
        { name: 'npm:@sentry/effect', version: SDK_VERSION },
        { name: `npm:@sentry/${subSdkName}`, version: SDK_VERSION },
      ]);
    }).pipe(
      Effect.provide(
        effectLayer({
          dsn: TEST_DSN,
          transport: getMockTransport(),
        }),
      ),
    ),
  );

  it.effect('layer can be provided to an Effect program', () =>
    Effect.gen(function* () {
      const result = yield* Effect.succeed('test-result');
      expect(result).toBe('test-result');
    }).pipe(
      Effect.provide(
        effectLayer({
          dsn: TEST_DSN,
          transport: getMockTransport(),
        }),
      ),
    ),
  );

  it.effect('layer enables tracing when tracer is set', () =>
    Effect.gen(function* () {
      const startInactiveSpanMock = vi.spyOn(sentryCore, 'startInactiveSpan');

      const result = yield* Effect.withSpan('test-span')(Effect.succeed('traced'));
      expect(result).toBe('traced');
      expect(startInactiveSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'test-span' }));
    }).pipe(
      Effect.withTracer(SentryEffectTracer),
      Effect.provide(
        effectLayer({
          dsn: TEST_DSN,
          transport: getMockTransport(),
        }),
      ),
    ),
  );

  it.effect('layer can be composed with tracer', () =>
    Effect.gen(function* () {
      const startInactiveSpanMock = vi.spyOn(sentryCore, 'startInactiveSpan');

      const result = yield* Effect.succeed(42).pipe(
        Effect.map(n => n * 2),
        Effect.withSpan('computation'),
      );
      expect(result).toBe(84);
      expect(startInactiveSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'computation' }));
    }).pipe(
      Effect.withTracer(SentryEffectTracer),
      Effect.provide(
        effectLayer({
          dsn: TEST_DSN,
          transport: getMockTransport(),
        }),
      ),
    ),
  );

  it.effect('layer can be composed with logger', () =>
    Effect.gen(function* () {
      yield* Effect.logInfo('test log');
      const result = yield* Effect.succeed('logged');
      expect(result).toBe('logged');
    }).pipe(
      Effect.provideService(References.MinimumLogLevel, 'All'),
      Effect.provide(
        Layer.mergeAll(
          effectLayer({
            dsn: TEST_DSN,
            transport: getMockTransport(),
          }),
          Logger.layer([SentryEffectLogger]),
        ),
      ),
    ),
  );

  it.effect('layer can be composed with all Effect features', () =>
    Effect.gen(function* () {
      const startInactiveSpanMock = vi.spyOn(sentryCore, 'startInactiveSpan');

      yield* Effect.logInfo('starting computation');
      const result = yield* Effect.succeed(42).pipe(
        Effect.map(n => n * 2),
        Effect.withSpan('computation'),
      );
      yield* Effect.logInfo('computation complete');
      expect(result).toBe(84);
      expect(startInactiveSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'computation' }));
    }).pipe(
      Effect.withTracer(SentryEffectTracer),
      Effect.provideService(References.MinimumLogLevel, 'All'),
      Effect.provide(
        Layer.mergeAll(
          effectLayer({
            dsn: TEST_DSN,
            transport: getMockTransport(),
          }),
          Logger.layer([SentryEffectLogger]),
        ),
      ),
    ),
  );
});
