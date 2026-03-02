import type { BaseTransportOptions, Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/core';
import { createTransport } from '@sentry/core';
import type * as EffectLayer from 'effect/Layer';
import { empty as emptyLayer, provideMerge, suspend as suspendLayer } from 'effect/Layer';
import { defaultLogger, replace as replaceLogger } from 'effect/Logger';
import type { EffectOptions } from './client';
import { SentryEffectLogger } from './logger';
import { SentryEffectMetricsLayer } from './metrics';
import { init } from './sdk';
import { SentryEffectTracerLayer } from './tracer';

export { SentryEffectLogger } from './logger';
export { SentryEffectMetricsLayer } from './metrics';
export { SentryEffectTracerLayer } from './tracer';

/**
 * Options for the Sentry Effect layer.
 */
export interface EffectLayerOptions extends EffectOptions {
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

function makeFetchTransport(options: BaseTransportOptions): Transport {
  async function makeRequest(request: TransportRequest): Promise<TransportMakeRequestResponse> {
    const response = await fetch(options.url, {
      body: request.body as BodyInit,
      method: 'POST',
    });

    return {
      statusCode: response.status,
      headers: {
        'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
        'retry-after': response.headers.get('Retry-After'),
      },
    };
  }

  return createTransport(options, makeRequest);
}

function makeEffectSentryLayerInternal(options: EffectLayerOptions): EffectLayer.Layer<never, never, never> {
  const transport: (options: BaseTransportOptions) => Transport =
    options.transport ?? (makeFetchTransport as (options: BaseTransportOptions) => Transport);

  const client = init({
    ...options,
    transport,
  });

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
 * Creates an Effect Layer that initializes Sentry and integrates tracing, logging, and metrics.
 *
 * This layer provides Effect applications with Sentry instrumentation:
 * - Initializes the Sentry SDK with the provided options
 * - Traces Effect spans as Sentry spans
 * - Forwards Effect logs to Sentry (when `enableLogs` is set)
 * - Sends Effect metrics to Sentry (when `enableMetrics` is set)
 *
 * @example
 * ```typescript
 * import * as Sentry from '@sentry/effect';
 * import { Layer } from 'effect';
 * import { NodeRuntime } from '@effect/platform-node';
 *
 * // Use in your Effect program
 * HttpLive.pipe(
 *   Layer.provide(Sentry.effectLayer({
 *     dsn: '__DSN__',
 *     enableLogs: true,
 *     enableMetrics: true,
 *   })),
 *   Layer.launch,
 *   NodeRuntime.runMain
 * );
 * ```
 */
export function effectLayer(options: EffectLayerOptions): EffectLayer.Layer<never, never, never> {
  return suspendLayer(() => makeEffectSentryLayerInternal(options));
}
