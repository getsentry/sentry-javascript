import type { BrowserOptions } from '@sentry/browser';
import type * as EffectLayer from 'effect/Layer';
import { empty as emptyLayer, merge as mergeLayer, suspend as suspendLayer } from 'effect/Layer';
import { makeSentryErrorReporterLayer } from '../errorReporter';
import { init } from './sdk';

export { init } from './sdk';

/**
 * Options for the Sentry Effect client layer.
 */
export type EffectClientLayerOptions = BrowserOptions;

/**
 * Creates an Effect Layer that initializes Sentry for browser clients.
 *
 * On Effect v4 the layer also registers a Sentry `ErrorReporter`, so failures passing through
 * `Effect.withErrorReporting`, `ErrorReporter.report` or the built-in HTTP and RPC boundaries are captured.
 *
 * To enable Effect tracing, logs, or metrics, merge the respective layers:
 * - `Sentry.layerTracer` for tracing
 * - `Sentry.layerLogger` for logs
 * - `Sentry.layerMetrics` for metrics
 *
 * @example
 * ```typescript
 * import * as Sentry from '@sentry/effect/client';
 * import { Layer } from 'effect';
 *
 * const SentryLayer = Layer.mergeAll(
 *   Sentry.layer({
 *     dsn: '__DSN__',
 *     integrations: [Sentry.browserTracingIntegration()],
 *     tracesSampleRate: 1.0,
 *   }),
 *   Sentry.layerTracer,
 *   Sentry.layerLogger,
 * );
 * ```
 */
export function layer(options: EffectClientLayerOptions): EffectLayer.Layer<never, never, never> {
  return mergeLayer(
    suspendLayer(() => {
      init(options);

      return emptyLayer;
    }),
    makeSentryErrorReporterLayer(),
  );
}
