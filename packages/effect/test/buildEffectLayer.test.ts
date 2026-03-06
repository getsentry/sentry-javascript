import { describe, expect, it, vi } from '@effect/vitest';
import * as sentryCore from '@sentry/core';
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

    it.effect('layer can be provided to an Effect program', () =>
      Effect.gen(function* () {
        const result = yield* Effect.succeed('test-result');
        expect(result).toBe('test-result');
      }).pipe(Effect.provide(buildEffectLayer({}, mockClient))),
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
});
