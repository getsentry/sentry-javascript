// We export everything from both the client part of the SDK and from the server part.
// Some of the exports collide, which is not allowed, unless we redifine the colliding
// exports in this file - which we do below.
export * from './client';
export * from './vite';
export * from './server';

import type { Integration, Options, StackParser } from '@sentry/types';
import type { HandleClientError, HandleServerError } from '@sveltejs/kit';

import type * as clientSdk from './client';
import type * as serverSdk from './server';

/** Initializes Sentry SvelteKit SDK */
export declare function init(options: Options | clientSdk.BrowserOptions | serverSdk.NodeOptions): void;

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

export declare const getDefaultIntegrations: (options: Options) => Integration[];
export declare const defaultStackParser: StackParser;

export declare const getClient: typeof clientSdk.getClient;
// eslint-disable-next-line deprecation/deprecation
export declare const getCurrentHub: typeof clientSdk.getCurrentHub;

export declare function close(timeout?: number | undefined): PromiseLike<boolean>;
export declare function flush(timeout?: number | undefined): PromiseLike<boolean>;

export declare const continueTrace: typeof clientSdk.continueTrace;

export declare const metrics: typeof clientSdk.metrics & typeof serverSdk.metrics;
