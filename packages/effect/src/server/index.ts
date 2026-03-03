import type { NodeOptions } from '@sentry/node-core';
import * as Sentry from '@sentry/node-core/light';
import type * as EffectLayer from 'effect/Layer';
import { empty as emptyLayer, provideMerge } from 'effect/Layer';
import { defaultLogger, replace as replaceLogger } from 'effect/Logger';
import { SentryEffectLogger } from '../logger';
import { SentryEffectMetricsLayer } from '../metrics';
import { SentryEffectTracerLayer } from '../tracer';

export { SentryEffectLogger } from '../logger';
export { SentryEffectMetricsLayer } from '../metrics';
export { SentryEffectTracerLayer } from '../tracer';

/**
 * Options for the Sentry Effect server layer.
 */
export interface EffectServerLayerOptions extends NodeOptions {
  /**
   * Enable Effect logs forwarding to Sentry.
   * @default false
   */
  enableLogs?: boolean;

  /**
   * Enable Effect metrics forwarding to Sentry.
   * @default false
   */
  enableMetrics?: boolean;
}

function makeEffectServerLayer(options: EffectServerLayerOptions): EffectLayer.Layer<never, never, never> {
  const { enableLogs = false, enableMetrics = false } = options;

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

/**
 * Creates an Effect Layer that initializes Sentry for Node.js servers.
 *
 * Uses `@sentry/node-core/light` which provides:
 * - HTTP integration via `diagnostics_channel` (no monkey-patching required)
 * - AsyncLocalStorage-based context strategy (compatible with Effect)
 * - Distributed tracing with automatic HTTP header extraction/injection
 *
 * This layer provides Effect applications with full Sentry instrumentation including:
 * - Distributed tracing with automatic HTTP header extraction/injection
 * - Effect spans traced as Sentry spans
 * - Effect logs forwarded to Sentry (when `enableLogs` is set)
 * - Effect metrics sent to Sentry (when `enableMetrics` is set)
 *
 * @example
 * ```typescript
 * import * as Sentry from '@sentry/effect/server';
 * import { NodeRuntime } from '@effect/platform-node';
 * import { Layer } from 'effect';
 * import { HttpLive } from './Http.js';
 *
 * const MainLive = HttpLive.pipe(
 *   Layer.provide(Sentry.effectLayer({
 *     dsn: '__DSN__',
 *     enableLogs: true,
 *     enableMetrics: true,
 *   })),
 * );
 *
 * MainLive.pipe(Layer.launch, NodeRuntime.runMain);
 * ```
 */
export function effectLayer(options: EffectServerLayerOptions): EffectLayer.Layer<never, never, never> {
  // Initialize Sentry with the light SDK (uses diagnostics_channel, not monkey-patching)
  const client = Sentry.init(options);

  if (!client) {
    return emptyLayer;
  }

  return makeEffectServerLayer(options);
}

export type { EffectServerLayerOptions as EffectLayerOptions };
