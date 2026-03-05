import type { NodeOptions } from '@sentry/node-core';
import * as EffectLayer from 'effect/Layer';

/**
 * Options for the Sentry Effect server layer.
 */
export type EffectServerLayerOptions = NodeOptions;

/**
 * Creates an empty Effect Layer
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
export function effectLayer(_: EffectServerLayerOptions): EffectLayer.Layer<never, never, never> {
  return EffectLayer.empty;
}
