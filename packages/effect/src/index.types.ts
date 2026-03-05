/* eslint-disable import/export */

// We export everything from both the client part of the SDK and from the server part.
// Some of the exports collide, which is not allowed, unless we redefine the colliding
// exports in this file - which we do below.
import type { Client, Integration, Options, StackParser } from '@sentry/core';
import type * as EffectLayer from 'effect/Layer';
import type * as clientSdk from './index.client';
import type * as serverSdk from './index.server';

export * from './index.client';
export * from './index.server';

export type { EffectClientLayerOptions } from './index.client';
export type { EffectServerLayerOptions } from './index.server';

export declare function effectLayer(
  options: clientSdk.EffectClientLayerOptions | serverSdk.EffectServerLayerOptions,
): EffectLayer.Layer<never, never, never>;

export declare function init(options: Options | clientSdk.BrowserOptions | serverSdk.NodeOptions): Client | undefined;
export declare const linkedErrorsIntegration: typeof clientSdk.linkedErrorsIntegration;
export declare const contextLinesIntegration: typeof clientSdk.contextLinesIntegration;
export declare const getDefaultIntegrations: (options: Options) => Integration[];
export declare const defaultStackParser: StackParser;
export declare const logger: typeof clientSdk.logger | typeof serverSdk.logger;
