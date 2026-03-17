import type { NodeOptions } from '@sentry/node-core/light';
import type * as EffectLayer from 'effect/Layer';
import { empty as emptyLayer, suspend as suspendLayer } from 'effect/Layer';
import { init } from './sdk';

export { init } from './sdk';

/**
 * Options for the Sentry Effect server layer.
 */
export type EffectServerLayerOptions = NodeOptions;

/**
 * Creates an Effect Layer that initializes Sentry for Node.js servers.
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
  return suspendLayer(() => {
    init(options);
    return emptyLayer;
  });
}
