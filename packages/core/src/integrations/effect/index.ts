import type * as Layer from 'effect/Layer';
import { empty as emptyLayer, provideMerge, suspend as suspendLayer } from 'effect/Layer';
import { defaultLogger, replace as replaceLogger } from 'effect/Logger';
import { getClient } from '../../currentScopes';
import { SentryEffectLogger } from './logger';
import { SentryEffectMetricsLayer } from './metrics';
import { SentryEffectTracerLayer } from './tracer';

function makeEffectSentryLayerInternal(): Layer.Layer<never, never, never> {
  const currentClient = getClient();

  if (!currentClient) {
    return emptyLayer;
  }

  const options = currentClient.getOptions() as { enableLogs?: boolean; enableMetrics?: boolean };
  const { enableLogs = false, enableMetrics = false } = options ?? {};

  let layer: Layer.Layer<never, never, never> = SentryEffectTracerLayer;

  if (enableLogs) {
    const effectLogger = replaceLogger(defaultLogger, SentryEffectLogger);
    layer = layer.pipe(provideMerge(effectLogger));
  }

  if (enableMetrics) {
    layer = layer.pipe(provideMerge(SentryEffectMetricsLayer));
  }

  return layer;
}

/**
 * Effect Layer that integrates Sentry tracing, logging, and metrics.
 *
 * This layer provides Effect applications with Sentry instrumentation:
 * - Traces Effect spans as Sentry spans
 * - Forwards Effect logs to Sentry (when `enableLogs` is set in Sentry options)
 * - Sends Effect metrics to Sentry (when `enableMetrics` is set in Sentry options)
 *
 * @example
 * ```typescript
 * import * as Sentry from '@sentry/node';
 * import { Effect } from 'effect';
 *
 * Sentry.init({
 *   dsn: 'your-dsn',
 *   enableLogs: true,
 *   enableMetrics: true,
 * });
 *
 * // Use in your Effect program
 * Effect.runPromise(
 *   myProgram.pipe(Effect.provide(Sentry.effectLayer))
 * );
 * ```
 */
export const effectLayer: Layer.Layer<never, never, never> = suspendLayer(() => makeEffectSentryLayerInternal());
