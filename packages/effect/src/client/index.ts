import type { BrowserOptions } from '@sentry/browser';
import type * as EffectLayer from 'effect/Layer';
import { empty as emptyLayer, suspend as suspendLayer } from 'effect/Layer';
import { init } from './sdk';

export { init } from './sdk';

/**
 * Options for the Sentry Effect client layer.
 */
export type EffectClientLayerOptions = BrowserOptions;

/**
 * Creates an Effect Layer that initializes Sentry for browser clients.
 *
 * To enable Effect tracing, logs, or metrics, compose with the respective layers:
 * - `Layer.setTracer(Sentry.SentryEffectTracer)` for tracing
 * - `Logger.replace(Logger.defaultLogger, Sentry.SentryEffectLogger)` for logs
 * - `Sentry.SentryEffectMetricsLayer` for metrics
 *
 * @example
 * ```typescript
 * import * as Sentry from '@sentry/effect/client';
 * import { Layer, Logger, LogLevel } from 'effect';
 *
 * const SentryLive = Layer.mergeAll(
 *   Sentry.effectLayer({
 *     dsn: '__DSN__',
 *     integrations: [Sentry.browserTracingIntegration()],
 *     tracesSampleRate: 1.0,
 *   }),
 *   Layer.setTracer(Sentry.SentryEffectTracer),
 *   Logger.replace(Logger.defaultLogger, Sentry.SentryEffectLogger),
 * );
 * ```
 */
export function effectLayer(options: EffectClientLayerOptions): EffectLayer.Layer<never, never, never> {
  return suspendLayer(() => {
    init(options);

    return emptyLayer;
  });
}
