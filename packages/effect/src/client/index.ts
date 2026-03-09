import type { BrowserOptions } from '@sentry/browser';
import type * as EffectLayer from 'effect/Layer';
import { suspend as suspendLayer } from 'effect/Layer';
import { buildEffectLayer } from '../utils/buildEffectLayer';
import { init } from './sdk';

export { init } from './sdk';

/**
 * Options for the Sentry Effect client layer.
 */
export type EffectClientLayerOptions = BrowserOptions;

/**
 * Creates an Effect Layer that initializes Sentry for browser clients.
 *
 * This layer provides Effect applications with full Sentry instrumentation including:
 * - Effect spans traced as Sentry spans
 * - Effect logs forwarded to Sentry (when `enableLogs` is set)
 * - Effect metrics sent to Sentry (when `enableMetrics` is set)
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
export function effectLayer(options: EffectClientLayerOptions): EffectLayer.Layer<never, never, never> {
  return suspendLayer(() => buildEffectLayer(init(options)));
}
