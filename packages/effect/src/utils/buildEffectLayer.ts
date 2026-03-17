import { hasSpansEnabled, type Client } from '@sentry/core';
import type * as EffectLayer from 'effect/Layer';
import { empty as emptyLayer, provideMerge, setTracer } from 'effect/Layer';
import { defaultLogger, replace as replaceLogger } from 'effect/Logger';
import { SentryEffectLogger } from '../logger';
import { SentryEffectMetricsLayer } from '../metrics';
import { SentryEffectTracer } from '../tracer';

export interface EffectLayerBaseOptions {
  enableEffectLogs?: boolean;
  enableEffectMetrics?: boolean;
}

/**
 * Builds an Effect layer that integrates Sentry tracing, logging, and metrics.
 *
 * Returns an empty layer if no Sentry client is available. Otherwise, starts with
 * the Sentry tracer layer and optionally merges logging and metrics layers based
 * on the provided options.
 */
export function buildEffectLayer<T extends EffectLayerBaseOptions>(
  options: T,
  client: Client | undefined,
): EffectLayer.Layer<never, never, never> {
  if (!client) {
    return emptyLayer;
  }

  const clientOptions = client.getOptions();
  const hasSpans = hasSpansEnabled(clientOptions);
  const enableMetrics = clientOptions.enableMetrics ?? clientOptions._experiments?.enableMetrics ?? true;
  const enableLogs = clientOptions.enableLogs ?? clientOptions._experiments?.enableLogs ?? false;
  const { enableEffectLogs = false, enableEffectMetrics = false } = options;
  let layer = emptyLayer;

  if (hasSpans) {
    layer = layer.pipe(provideMerge(setTracer(SentryEffectTracer)));
  }

  if (enableEffectLogs && enableLogs) {
    const effectLogger = replaceLogger(defaultLogger, SentryEffectLogger);
    layer = layer.pipe(provideMerge(effectLogger));
  }

  if (enableEffectMetrics && enableMetrics) {
    layer = layer.pipe(provideMerge(SentryEffectMetricsLayer));
  }

  return layer;
}
