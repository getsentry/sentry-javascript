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
 * To enable Effect tracing, logs, or metrics, compose with the respective layers:
 * - `Layer.setTracer(Sentry.SentryEffectTracer)` for tracing
 * - `Logger.replace(Logger.defaultLogger, Sentry.SentryEffectLogger)` for logs
 * - `Sentry.SentryEffectMetricsLayer` for metrics
 *
 * @example
 * ```typescript
 * import * as Sentry from '@sentry/effect/server';
 * import { NodeRuntime } from '@effect/platform-node';
 * import { Layer, Logger } from 'effect';
 * import { HttpLive } from './Http.js';
 *
 * const SentryLive = Layer.mergeAll(
 *   Sentry.effectLayer({ dsn: '__DSN__' }),
 *   Layer.setTracer(Sentry.SentryEffectTracer),
 *   Logger.replace(Logger.defaultLogger, Sentry.SentryEffectLogger),
 * );
 *
 * const MainLive = HttpLive.pipe(Layer.provide(SentryLive));
 * MainLive.pipe(Layer.launch, NodeRuntime.runMain);
 * ```
 */
export function effectLayer(options: EffectServerLayerOptions): EffectLayer.Layer<never, never, never> {
  return mergeLayer(
    suspendLayer(() => {
      init(options);
      return emptyLayer;
    }),
    makeSentryErrorReporterLayer(),
  );
}
