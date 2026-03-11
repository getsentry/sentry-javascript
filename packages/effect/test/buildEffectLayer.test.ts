import { describe, expect, it, vi } from '@effect/vitest';
import * as sentryCore from '@sentry/core';
import { logger as sentryLogger } from '@sentry/core';
import type { NodeOptions } from '@sentry/node-core';
import { Effect, Layer } from 'effect';
import { empty as emptyLayer } from 'effect/Layer';
import { init } from '../src/index.server';
import { buildEffectLayer } from '../src/utils/buildEffectLayer';

function getMockTransport() {
  return () => ({
    send: vi.fn().mockResolvedValue({}),
    flush: vi.fn().mockResolvedValue(true),
  });
}

function createClient(options: NodeOptions = {}) {
  return init({
    dsn: 'https://username@domain/123',
    transport: getMockTransport(),
    ...options,
  });
}

describe('buildEffectLayer', () => {
  describe('when client is falsy', () => {
    it('returns empty layer when client is null', () => {
      const layer = buildEffectLayer({}, undefined);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
      expect(layer).toBe(emptyLayer);
    });

    it('returns empty layer when client is undefined', () => {
      const layer = buildEffectLayer({}, undefined);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
      expect(layer).toBe(emptyLayer);
    });
  });

  describe('when client is truthy', () => {
    it('returns a valid layer with default options', () => {
      const client = createClient();
      const layer = buildEffectLayer({}, client);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it('returns a valid layer with enableEffectLogs: false', () => {
      const client = createClient();
      const layer = buildEffectLayer({ enableEffectLogs: false }, client);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it('returns a valid layer with enableEffectLogs: true', () => {
      const client = createClient();
      const layer = buildEffectLayer({ enableEffectLogs: true }, client);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it('returns a valid layer with enableEffectMetrics: false', () => {
      const client = createClient();
      const layer = buildEffectLayer({ enableEffectMetrics: false }, client);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it('returns a valid layer with enableEffectMetrics: true', () => {
      const client = createClient();
      const layer = buildEffectLayer({ enableEffectMetrics: true }, client);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it('returns a valid layer with all features enabled', () => {
      const client = createClient();
      const layer = buildEffectLayer({ enableEffectLogs: true, enableEffectMetrics: true }, client);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it.effect('layer can be provided to an Effect program', () =>
      Effect.gen(function* () {
        const result = yield* Effect.succeed('test-result');
        expect(result).toBe('test-result');
      }).pipe(Effect.provide(buildEffectLayer({}, createClient()))),
    );

    it.effect('layer with logs enabled routes Effect logs to Sentry logger', () =>
      Effect.gen(function* () {
        const infoSpy = vi.spyOn(sentryLogger, 'info');
        yield* Effect.log('test log message');
        expect(infoSpy).toHaveBeenCalledWith('test log message');
        infoSpy.mockRestore();
      }).pipe(Effect.provide(buildEffectLayer({ enableEffectLogs: true }, createClient({ enableLogs: true })))),
    );

    it('returns different layer when enableEffectMetrics is true vs false', () => {
      const client = createClient();
      const layerWithMetrics = buildEffectLayer({ enableEffectMetrics: true }, client);
      const layerWithoutMetrics = buildEffectLayer({ enableEffectMetrics: false }, client);

      expect(layerWithMetrics).not.toBe(layerWithoutMetrics);
    });

    it.effect('layer with all features enabled can be provided to an Effect program', () =>
      Effect.gen(function* () {
        const result = yield* Effect.succeed('all-features');
        expect(result).toBe('all-features');
      }).pipe(
        Effect.provide(
          buildEffectLayer({ enableEffectLogs: true, enableEffectMetrics: true }, createClient({ enableLogs: true })),
        ),
      ),
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
      }).pipe(Effect.provide(buildEffectLayer({}, createClient()))),
    );
  });

  describe('with additional options', () => {
    const client = createClient({ enableLogs: true });

    it('accepts options with additional properties', () => {
      const layer = buildEffectLayer(
        {
          enableEffectLogs: true,
          enableEffectMetrics: true,
          dsn: 'https://test@sentry.io/123',
          debug: true,
        } as { enableEffectLogs?: boolean; enableEffectMetrics?: boolean; dsn?: string; debug?: boolean },
        client,
      );

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });
  });
});
