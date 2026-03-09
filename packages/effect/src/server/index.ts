import type { NodeOptions } from '@sentry/node-core/light';
import type * as EffectLayer from 'effect/Layer';
import { buildEffectLayer } from '../utils/buildEffectLayer';
import { init } from './sdk';

export { init } from './sdk';

/**
 * Options for the Sentry Effect server layer.
 */
export type EffectServerLayerOptions = NodeOptions;

/**
 * Creates an Effect Layer that initializes Sentry for Node.js servers.
 *
 * This layer provides Effect applications with full Sentry instrumentation including:
 * - Effect spans traced as Sentry spans
 * - Effect logs forwarded to Sentry (when `enableLogs` is set)
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
  return buildEffectLayer(options, init(options));
}
