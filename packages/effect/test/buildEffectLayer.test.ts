import { describe, expect, it, vi } from '@effect/vitest';
import * as sentryCore from '@sentry/core';
import { logger as sentryLogger } from '@sentry/core';
import { Effect, Layer } from 'effect';
import { empty as emptyLayer } from 'effect/Layer';
import { buildEffectLayer } from '../src/utils/buildEffectLayer';

describe('buildEffectLayer', () => {
  describe('when client is falsy', () => {
    it('returns empty layer when client is null', () => {
      const layer = buildEffectLayer({}, null);

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
    const mockClient = { mock: true };

    it('returns a valid layer with default options', () => {
      const layer = buildEffectLayer({}, mockClient);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it('returns a valid layer with enableEffectLogs: false', () => {
      const layer = buildEffectLayer({ enableEffectLogs: false }, mockClient);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it('returns a valid layer with enableEffectLogs: true', () => {
      const layer = buildEffectLayer({ enableEffectLogs: true }, mockClient);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it('returns a valid layer with enableEffectMetrics: false', () => {
      const layer = buildEffectLayer({ enableEffectMetrics: false }, mockClient);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it('returns a valid layer with enableEffectMetrics: true', () => {
      const layer = buildEffectLayer({ enableEffectMetrics: true }, mockClient);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it('returns a valid layer with all features enabled', () => {
      const layer = buildEffectLayer({ enableEffectLogs: true, enableEffectMetrics: true }, mockClient);

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });

    it.effect('layer can be provided to an Effect program', () =>
      Effect.gen(function* () {
        const result = yield* Effect.succeed('test-result');
        expect(result).toBe('test-result');
      }).pipe(Effect.provide(buildEffectLayer({}, mockClient))),
    );

    it.effect('layer with logs enabled routes Effect logs to Sentry logger', () =>
      Effect.gen(function* () {
        const infoSpy = vi.spyOn(sentryLogger, 'info');
        yield* Effect.log('test log message');
        expect(infoSpy).toHaveBeenCalledWith('test log message');
        infoSpy.mockRestore();
      }).pipe(Effect.provide(buildEffectLayer({ enableEffectLogs: true }, mockClient))),
    );

    it('returns different layer when enableEffectMetrics is true vs false', () => {
      const layerWithMetrics = buildEffectLayer({ enableEffectMetrics: true }, mockClient);
      const layerWithoutMetrics = buildEffectLayer({ enableEffectMetrics: false }, mockClient);

      expect(layerWithMetrics).not.toBe(layerWithoutMetrics);
    });

    it.effect('layer with all features enabled can be provided to an Effect program', () =>
      Effect.gen(function* () {
        const result = yield* Effect.succeed('all-features');
        expect(result).toBe('all-features');
      }).pipe(Effect.provide(buildEffectLayer({ enableEffectLogs: true, enableEffectMetrics: true }, mockClient))),
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
      }).pipe(Effect.provide(buildEffectLayer({}, mockClient))),
    );
  });

  describe('with additional options', () => {
    const mockClient = { mock: true };

    it('accepts options with additional properties', () => {
      const layer = buildEffectLayer(
        {
          enableEffectLogs: true,
          enableEffectMetrics: true,
          dsn: 'https://test@sentry.io/123',
          debug: true,
        } as { enableEffectLogs?: boolean; enableEffectMetrics?: boolean; dsn?: string; debug?: boolean },
        mockClient,
      );

      expect(layer).toBeDefined();
      expect(Layer.isLayer(layer)).toBe(true);
    });
  });
});
