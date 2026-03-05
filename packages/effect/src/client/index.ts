import type { BrowserOptions } from '@sentry/browser';
import * as EffectLayer from 'effect/Layer';

/**
 * Options for the Sentry Effect client layer.
 */
export type EffectClientLayerOptions = BrowserOptions;

/**
 * Creates an empty Effect Layer
 *
 * @example
 * ```typescript
 * import * as Sentry from '@sentry/effect/client';
 * import { Layer, Effect } from 'effect';
 *
 * const ApiClientWithSentry = ApiClientLive.pipe(
 *   Layer.provide(Sentry.effectLayer({
 *     dsn: '__DSN__',
 *     integrations: [Sentry.browserTracingIntegration()],
 *     tracesSampleRate: 1.0,
 *   })),
 * );
 *
 * Effect.runPromise(Effect.provide(myEffect, ApiClientWithSentry));
 * ```
 */
export function effectLayer(_: EffectClientLayerOptions): EffectLayer.Layer<never, never, never> {
  return EffectLayer.empty;
}
