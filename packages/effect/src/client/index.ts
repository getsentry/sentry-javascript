import type { BrowserOptions } from '@sentry/browser';
import * as Sentry from '@sentry/browser';
import type * as EffectLayer from 'effect/Layer';
import { empty as emptyLayer, provideMerge, suspend as suspendLayer } from 'effect/Layer';
import { defaultLogger, replace as replaceLogger } from 'effect/Logger';
import { SentryEffectLogger } from '../logger';
import { SentryEffectMetricsLayer } from '../metrics';
import { SentryEffectTracerLayer } from '../tracer';

export { SentryEffectLogger } from '../logger';
export { SentryEffectMetricsLayer } from '../metrics';
export { SentryEffectTracerLayer } from '../tracer';

/**
 * Options for the Sentry Effect client layer.
 */
export interface EffectClientLayerOptions extends BrowserOptions {
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

function makeEffectClientLayerInternal(options: EffectClientLayerOptions): EffectLayer.Layer<never, never, never> {
  const client = Sentry.init(options);

  if (!client) {
    return emptyLayer;
  }

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
 * Creates an Effect Layer that initializes Sentry for browser clients.
 *
 * This layer provides Effect applications with full Sentry instrumentation including:
 * - Browser tracing with automatic fetch header injection
 * - Effect spans traced as Sentry spans
 * - Effect logs forwarded to Sentry (when `enableLogs` is set)
 * - Effect metrics sent to Sentry (when `enableMetrics` is set)
 *
 * @example
 * ```typescript
 * import * as Sentry from '@sentry/effect/client';
 * import { Layer, Effect } from 'effect';
 *
 * const ApiClientWithSentry = ApiClientLive.pipe(
 *   Layer.provide(Sentry.effectLayer({
 *     dsn: '__DSN__',
 *     integrations: [Sentry.browserTracingIntegration()],
 *     tracesSampleRate: 1.0,
 *   })),
 * );
 *
 * Effect.runPromise(Effect.provide(myEffect, ApiClientWithSentry));
 * ```
 */
export function effectLayer(options: EffectClientLayerOptions): EffectLayer.Layer<never, never, never> {
  return suspendLayer(() => makeEffectClientLayerInternal(options));
}

export type { EffectClientLayerOptions as EffectLayerOptions };
