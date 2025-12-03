// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */

import type { Client, Integration, Options, StackParser } from '@sentry/core';
import type { SentryNuxtClientOptions, SentryNuxtServerOptions } from './common/types';
import type * as clientSdk from './index.client';
import type * as serverSdk from './index.server';

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

export declare const logger: typeof clientSdk.logger | typeof serverSdk.logger;

export declare const growthbookIntegration: typeof clientSdk.growthbookIntegration;
export declare const launchDarklyIntegration: typeof clientSdk.launchDarklyIntegration;
export declare const buildLaunchDarklyFlagUsedHandler: typeof clientSdk.buildLaunchDarklyFlagUsedHandler;
export declare const openFeatureIntegration: typeof clientSdk.openFeatureIntegration;
export declare const OpenFeatureIntegrationHook: typeof clientSdk.OpenFeatureIntegrationHook;
export declare const statsigIntegration: typeof clientSdk.statsigIntegration;
export declare const unleashIntegration: typeof clientSdk.unleashIntegration;
