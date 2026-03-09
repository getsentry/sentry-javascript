import { describe, expect, it, vi } from '@effect/vitest';
import * as sentryCore from '@sentry/core';
import { getCurrentScope, getIsolationScope, logger as sentryLogger, metrics as sentryMetrics } from '@sentry/core';
import { Effect, Layer } from 'effect';
import { empty as emptyLayer } from 'effect/Layer';
import * as Metric from 'effect/Metric';
import { afterEach, beforeEach } from 'vitest';
import { init } from '../src/client/sdk';
import { flushMetricsToSentry } from '../src/metrics';
import { buildEffectLayer } from '../src/utils/buildEffectLayer';

const TEST_DSN = 'https://username@domain/123';

function getMockTransport() {
  return () => ({
    send: vi.fn().mockResolvedValue({}),
    flush: vi.fn().mockResolvedValue(true),
  });
}

function createClient(options: { enableLogs?: boolean; enableMetrics?: boolean } = {}) {
  return init({
    dsn: TEST_DSN,
    transport: getMockTransport(),
    ...options,
  });
}

describe('buildEffectLayer', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
  });

  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  describe('when client is falsy', () => {
    it('returns empty layer when client is undefined', () => {
      const layer = buildEffectLayer(undefined);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
      expect(layer).toBe(emptyLayer);
    });
  });

  describe('when client is truthy', () => {
    it('returns a valid layer with default options', () => {
      const client = createClient();
      const layer = buildEffectLayer(client);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it('returns a valid layer with enableLogs: false', () => {
      const client = createClient({ enableLogs: false });
      const layer = buildEffectLayer(client);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it('returns a valid layer with enableLogs: true', () => {
      const client = createClient({ enableLogs: true });
      const layer = buildEffectLayer(client);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it('returns a valid layer with enableMetrics: false', () => {
      const client = createClient({ enableMetrics: false });
      const layer = buildEffectLayer(client);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it('returns a valid layer with enableMetrics: true', () => {
      const client = createClient({ enableMetrics: true });
      const layer = buildEffectLayer(client);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it('returns a valid layer with all features enabled', () => {
      const client = createClient({ enableLogs: true, enableMetrics: true });
      const layer = buildEffectLayer(client);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it.effect('layer can be provided to an Effect program', () =>
      Effect.gen(function* () {
        const result = yield* Effect.succeed('test-result');
        expect(result).toBe('test-result');
      }).pipe(Effect.provide(buildEffectLayer(createClient()))),
    );

    it.effect('layer with logs enabled routes Effect logs to Sentry logger', () =>
      Effect.gen(function* () {
        const infoSpy = vi.spyOn(sentryLogger, 'info');
        yield* Effect.log('test log message');
        expect(infoSpy).toHaveBeenCalledWith('test log message');
        infoSpy.mockRestore();
      }).pipe(Effect.provide(buildEffectLayer(createClient({ enableLogs: true })))),
    );

    it('returns different layer when enableMetrics is true vs false', () => {
      const clientWithMetrics = createClient({ enableMetrics: true });
      const clientWithoutMetrics = createClient({ enableMetrics: false });
      const layerWithMetrics = buildEffectLayer(clientWithMetrics);
      const layerWithoutMetrics = buildEffectLayer(clientWithoutMetrics);

      expect(layerWithMetrics).not.toBe(layerWithoutMetrics);
    });

    it.effect('layer with all features enabled can be provided to an Effect program', () =>
      Effect.gen(function* () {
        const result = yield* Effect.succeed('all-features');
        expect(result).toBe('all-features');
      }).pipe(Effect.provide(buildEffectLayer(createClient({ enableLogs: true, enableMetrics: true })))),
    );

    it.effect('layer enables tracing for Effect spans via Sentry tracer', () =>
      Effect.gen(function* () {
        const startInactiveSpanSpy = vi.spyOn(sentryCore, 'startInactiveSpan');
        const result = yield* Effect.withSpan('test-sentry-span')(Effect.succeed('traced'));
        expect(result).toBe('traced');
        expect(startInactiveSpanSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'test-sentry-span',
          }),
        );
        startInactiveSpanSpy.mockRestore();
      }).pipe(Effect.provide(buildEffectLayer(createClient()))),
    );

    it('routes Effect metrics to Sentry when enableMetrics is true (default)', () => {
      const client = createClient()!;
      const emitSpy = vi.spyOn(client, 'emit');
      getCurrentScope().setClient(client);

      const testCounter = Metric.counter('test-metrics-enabled');
      Effect.runSync(Metric.increment(testCounter));
      flushMetricsToSentry();

      expect(emitSpy).toHaveBeenCalledWith('processMetric', expect.objectContaining({ name: 'test-metrics-enabled' }));
      emitSpy.mockRestore();
    });

    it('does not route Effect metrics to Sentry when enableMetrics is false', () => {
      const client = createClient({ enableMetrics: false })!;
      const emitSpy = vi.spyOn(client, 'emit');
      getCurrentScope().setClient(client);

      const testCounter = Metric.counter('test-metrics-disabled');
      Effect.runSync(Metric.increment(testCounter));
      flushMetricsToSentry();

      expect(emitSpy).not.toHaveBeenCalledWith(
        'processMetric',
        expect.objectContaining({ name: 'test-metrics-disabled' }),
      );
      emitSpy.mockRestore();
    });
  });
});
