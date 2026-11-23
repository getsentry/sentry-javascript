import type { NodeOptions } from '@sentry/node';
import type * as EffectLayer from 'effect/Layer';
import { empty as emptyLayer, merge as mergeLayer, suspend as suspendLayer } from 'effect/Layer';
import { makeSentryErrorReporterLayer } from '../errorReporter';
import { init } from './sdk';

export { init } from './sdk';

/**
 * Options for the Sentry Effect server layer.
 */
export type EffectServerLayerOptions = NodeOptions;

/**
 * Creates an Effect Layer that initializes Sentry for Node.js servers.
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
 * import * as Sentry from '@sentry/effect/server';
 * import { NodeRuntime } from '@effect/platform-node';
 * import { Layer } from 'effect';
 * import { HttpLayer } from './Http.js';
 *
 * const SentryLayer = Layer.mergeAll(
 *   Sentry.layer({ dsn: '__DSN__', tracesSampleRate: 1.0 }),
 *   Sentry.layerTracer,
 *   Sentry.layerLogger,
 *   Sentry.layerMetrics,
 * );
 *
 * const MainLayer = HttpLayer.pipe(Layer.provide(SentryLayer));
 * MainLayer.pipe(Layer.launch, NodeRuntime.runMain);
 * ```
 */
export function layer(options: EffectServerLayerOptions): EffectLayer.Layer<never, never, never> {
  return mergeLayer(
    suspendLayer(() => {
      init(options);
      return emptyLayer;
    }),
    makeSentryErrorReporterLayer(),
  );
}
