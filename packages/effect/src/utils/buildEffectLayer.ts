import type * as EffectLayer from 'effect/Layer';
import { empty as emptyLayer, provideMerge } from 'effect/Layer';
import { defaultLogger, replace as replaceLogger } from 'effect/Logger';
import { SentryEffectLogger } from '../logger';
import { SentryEffectTracerLayer } from '../tracer';

export interface EffectLayerBaseOptions {
  enableLogs?: boolean;
}

/**
 * Builds an Effect layer that integrates Sentry tracing and logging.
 *
 * Returns an empty layer if no Sentry client is available. Otherwise, starts with
 * the Sentry tracer layer and optionally merges logging and metrics layers based
 * on the provided options.
 */
export function buildEffectLayer<T extends EffectLayerBaseOptions>(
  options: T,
  client: unknown,
): EffectLayer.Layer<never, never, never> {
  if (!client) {
    return emptyLayer;
  }

  const { enableLogs = false } = options;
  let layer: EffectLayer.Layer<never, never, never> = SentryEffectTracerLayer;

  if (enableLogs) {
    const effectLogger = replaceLogger(defaultLogger, SentryEffectLogger);
    layer = layer.pipe(provideMerge(effectLogger));
  }

  return layer;
}
