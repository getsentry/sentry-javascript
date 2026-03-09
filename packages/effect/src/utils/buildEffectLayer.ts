import type { Client } from '@sentry/core';
import type * as EffectLayer from 'effect/Layer';
import { empty as emptyLayer, provideMerge } from 'effect/Layer';
import { defaultLogger, replace as replaceLogger } from 'effect/Logger';
import { SentryEffectLogger } from '../logger';
import { SentryEffectMetricsLayer } from '../metrics';
import { SentryEffectTracerLayer } from '../tracer';

/**
 * Builds an Effect layer that integrates Sentry tracing, logging, and metrics.
 *
 * Returns an empty layer if no Sentry client is available. Otherwise, starts with
 * the Sentry tracer layer and optionally merges logging and metrics layers based
 * on the provided options.
 */
export function buildEffectLayer(
  client: Client | undefined,
): EffectLayer.Layer<never, never, never> {
  if (!client) {
    return emptyLayer;
  }

  const { enableLogs, enableMetrics } = client.getOptions();

  let layer: EffectLayer.Layer<never, never, never> = SentryEffectTracerLayer;

  if (enableLogs) {
    const effectLogger = replaceLogger(defaultLogger, SentryEffectLogger);
    layer = layer.pipe(provideMerge(effectLogger));
  }

  if (enableMetrics) {
    layer = layer.pipe(provideMerge(SentryEffectMetricsLayer));
  }

  return layer;
}
