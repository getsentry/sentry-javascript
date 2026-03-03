import { describe, expect, it } from '@effect/vitest';
import { getCurrentScope, getIsolationScope } from '@sentry/core';
import { Effect, Layer } from 'effect';
import { afterEach, beforeEach, vi } from 'vitest';
import { effectLayer, SentryEffectLogger, SentryEffectMetricsLayer, SentryEffectTracerLayer } from '../src/layer';

const TEST_DSN = 'https://username@domain/123';

function getMockTransport() {
  return () => ({
    send: vi.fn().mockResolvedValue({}),
    flush: vi.fn().mockResolvedValue(true),
  });
}

describe('effectLayer', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
  });

  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('creates a valid Effect layer', () => {
    const layer = effectLayer({
      dsn: TEST_DSN,
      transport: getMockTransport(),
    });

    expect(layer).toBeDefined();
    expect(Layer.isLayer(layer)).toBe(true);
  });

  it('creates layer with logs enabled', () => {
    const layer = effectLayer({
      dsn: TEST_DSN,
      transport: getMockTransport(),
      enableLogs: true,
    });

    expect(layer).toBeDefined();
  });

  it('creates layer with metrics enabled', () => {
    const layer = effectLayer({
      dsn: TEST_DSN,
      transport: getMockTransport(),
      enableMetrics: true,
    });

    expect(layer).toBeDefined();
  });

  it('creates layer with all features enabled', () => {
    const layer = effectLayer({
      dsn: TEST_DSN,
      transport: getMockTransport(),
      enableLogs: true,
      enableMetrics: true,
    });

    expect(layer).toBeDefined();
  });

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

  it.effect('layer enables tracing for Effect spans', () =>
    Effect.gen(function* () {
      const result = yield* Effect.withSpan('test-span')(Effect.succeed('traced'));
      expect(result).toBe('traced');
    }).pipe(
      Effect.provide(
        effectLayer({
          dsn: TEST_DSN,
          transport: getMockTransport(),
        }),
      ),
    ),
  );

  it.effect('layer can be composed with other layers', () =>
    Effect.gen(function* () {
      const result = yield* Effect.succeed(42).pipe(
        Effect.map(n => n * 2),
        Effect.withSpan('computation'),
      );
      expect(result).toBe(84);
    }).pipe(
      Effect.provide(
        effectLayer({
          dsn: TEST_DSN,
          transport: getMockTransport(),
        }),
      ),
    ),
  );
});

describe('SentryEffectTracerLayer', () => {
  it('is a valid Effect layer', () => {
    expect(SentryEffectTracerLayer).toBeDefined();
    expect(Layer.isLayer(SentryEffectTracerLayer)).toBe(true);
  });
});

describe('SentryEffectLogger', () => {
  it('is a valid Effect Logger', () => {
    expect(SentryEffectLogger).toBeDefined();
  });
});

describe('SentryEffectMetricsLayer', () => {
  it('is a valid Effect layer', () => {
    expect(SentryEffectMetricsLayer).toBeDefined();
    expect(Layer.isLayer(SentryEffectMetricsLayer)).toBe(true);
  });
});
