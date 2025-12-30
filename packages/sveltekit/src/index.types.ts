// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */

// We export everything from both the client part of the SDK and from the server part.
// Some of the exports collide, which is not allowed, unless we redefine the colliding
// exports in this file - which we do below.
import type { Client, Integration, Options, StackParser } from '@sentry/core';
import type { HandleClientError, HandleServerError } from '@sveltejs/kit';
import type * as clientSdk from './client';
import type * as serverSdk from './server';

export * from './client';
export * from './vite';
export * from './server';
export * from './worker';

// Use the ./server version of some functions that are also exported from ./worker
export { sentryHandle } from './server';
// Use the ./worker version of some functions that are also exported from ./server
export { initCloudflareSentryHandle } from './worker';

/** Initializes Sentry SvelteKit SDK */
export declare function init(options: Options | clientSdk.BrowserOptions | serverSdk.NodeOptions): Client | undefined;

export declare function handleErrorWithSentry<T extends HandleClientError | HandleServerError>(handleError?: T): T;

/**
 * Wrap a universal load function (e.g. +page.js or +layout.js) with Sentry functionality
 *
 * Usage:
 *
 * ```js
 * // +page.js
 *
 * import { wrapLoadWithSentry }
 *
 * export const load = wrapLoadWithSentry((event) => {
 *   // your load code
 * });
 * ```
 *
 * @param origLoad SvelteKit user defined universal `load` function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export declare function wrapLoadWithSentry<T extends (...args: any) => any>(origLoad: T): T;

export declare const linkedErrorsIntegration: typeof clientSdk.linkedErrorsIntegration;
export declare const contextLinesIntegration: typeof clientSdk.contextLinesIntegration;

// Different implementation in server and worker
export declare const vercelAIIntegration: typeof serverSdk.vercelAIIntegration;

export declare const getDefaultIntegrations: (options: Options) => Integration[];
export declare const defaultStackParser: StackParser;

export declare function close(timeout?: number | undefined): PromiseLike<boolean>;
export declare function flush(timeout?: number | undefined): PromiseLike<boolean>;
export declare function lastEventId(): string | undefined;

export declare function trackComponent(options: clientSdk.TrackingOptions): ReturnType<typeof clientSdk.trackComponent>;

export declare const logger: typeof clientSdk.logger | typeof serverSdk.logger;

export declare const growthbookIntegration: typeof clientSdk.growthbookIntegration;
export declare const launchDarklyIntegration: typeof clientSdk.launchDarklyIntegration;
export declare const buildLaunchDarklyFlagUsedHandler: typeof clientSdk.buildLaunchDarklyFlagUsedHandler;
export declare const openFeatureIntegration: typeof clientSdk.openFeatureIntegration;
export declare const OpenFeatureIntegrationHook: typeof clientSdk.OpenFeatureIntegrationHook;
export declare const statsigIntegration: typeof clientSdk.statsigIntegration;
export declare const unleashIntegration: typeof clientSdk.unleashIntegration;
