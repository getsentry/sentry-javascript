/* eslint-disable import/export */

// We export everything from both the client part of the SDK and from the server part.
// Some of the exports collide, which is not allowed, unless we redefine the colliding
// exports in this file - which we do below.
import type { Client, Options } from '@sentry/core';
import type * as EffectLayer from 'effect/Layer';
import type * as clientSdk from './client/index';
import type * as serverSdk from './server/index';

export * from './client/index';
export * from './server/index';

/** Options for the Sentry Effect layer */
export type EffectLayerOptions = clientSdk.EffectClientLayerOptions | serverSdk.EffectServerLayerOptions;

/** Initializes Sentry Effect SDK */
export declare function init(options: Options): Client | undefined;

/** Creates an Effect Layer that initializes Sentry and integrates tracing, logging, and metrics. */
export declare function effectLayer(options: EffectLayerOptions): EffectLayer.Layer<never, never, never>;
