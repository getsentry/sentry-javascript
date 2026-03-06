import type * as EffectLayer from 'effect/Layer';
import { empty as emptyLayer } from 'effect/Layer';
import { SentryEffectTracerLayer } from '../tracer';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface EffectLayerBaseOptions {}

/**
 * Builds an Effect layer that integrates Sentry tracing.
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

  return SentryEffectTracerLayer;
}
