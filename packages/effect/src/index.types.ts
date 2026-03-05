/* eslint-disable import/export */

// We export everything from both the client part of the SDK and from the server part.
// Some of the exports collide, which is not allowed, unless we redefine the colliding
// exports in this file - which we do below.
import type * as EffectLayer from 'effect/Layer';
import type { EffectClientLayerOptions } from './index.client';
import type { EffectServerLayerOptions } from './index.server';

export * from './client/index';
export * from './server/index';

/** Creates an Effect Layer that initializes Sentry and integrates tracing, logging, and metrics. */
export declare function effectLayer(options: EffectClientLayerOptions | EffectServerLayerOptions): EffectLayer.Layer<never, never, never>;
