// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */

// We export everything from both the client part of the SDK and from the server part. Some of the exports collide,
// which is not allowed, unless we redefine the colliding exports in this file - which we do below.
import type { Client, Integration, Options, StackParser } from '@sentry/core';
import * as clientSdk from './index.client';
import * as serverSdk from './index.server';
import type { RemixOptions } from './utils/remixOptions';

export * from './index.client';
export * from './index.server';

/** Initializes Sentry Remix SDK */
export declare function init(options: RemixOptions): Client | undefined;

export declare const browserTracingIntegration: typeof clientSdk.browserTracingIntegration;
export declare const linkedErrorsIntegration: typeof clientSdk.linkedErrorsIntegration;
export declare const contextLinesIntegration: typeof clientSdk.contextLinesIntegration;

export declare const getDefaultIntegrations: (options: Options) => Integration[];
export declare const defaultStackParser: StackParser;

export declare function captureRemixServerException(err: unknown, name: string, request: Request): Promise<void>;

export declare const logger: typeof clientSdk.logger | typeof serverSdk.logger;

// This variable is not a runtime variable but just a type to tell typescript that the methods below can either come
// from the client SDK or from the server SDK. TypeScript is smart enough to understand that these resolve to the same
// methods from `@sentry/core`.
declare const runtime: 'client' | 'server';

export const close = runtime === 'client' ? clientSdk.close : serverSdk.close;
export const flush = runtime === 'client' ? clientSdk.flush : serverSdk.flush;
export const lastEventId = runtime === 'client' ? clientSdk.lastEventId : serverSdk.lastEventId;

export declare const growthbookIntegration: typeof clientSdk.growthbookIntegration;
export declare const launchDarklyIntegration: typeof clientSdk.launchDarklyIntegration;
export declare const buildLaunchDarklyFlagUsedHandler: typeof clientSdk.buildLaunchDarklyFlagUsedHandler;
export declare const openFeatureIntegration: typeof clientSdk.openFeatureIntegration;
export declare const OpenFeatureIntegrationHook: typeof clientSdk.OpenFeatureIntegrationHook;
export declare const statsigIntegration: typeof clientSdk.statsigIntegration;
export declare const unleashIntegration: typeof clientSdk.unleashIntegration;
