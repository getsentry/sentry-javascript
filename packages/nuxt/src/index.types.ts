import type { Client, Integration, Options, StackParser } from '@sentry/core';
import type { SentryNuxtClientOptions, SentryNuxtServerOptions } from './common/types';
import type * as clientSdk from './index.client';

// We export everything from both the client part of the SDK and from the server part. Some of the exports collide,
// which is not allowed, unless we re-export the colliding exports in this file - which we do below.
export * from './index.client';
export * from './index.server';

// re-export colliding types
export declare function init(options: Options | SentryNuxtClientOptions | SentryNuxtServerOptions): Client | undefined;
export declare const linkedErrorsIntegration: typeof clientSdk.linkedErrorsIntegration;
export declare const contextLinesIntegration: typeof clientSdk.contextLinesIntegration;
export declare const getDefaultIntegrations: (options: Options) => Integration[];
export declare const defaultStackParser: StackParser;
