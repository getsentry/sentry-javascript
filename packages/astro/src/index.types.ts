// We export everything from both the client part of the SDK and from the server part.
// Some of the exports collide, which is not allowed, unless we redefine the colliding
// exports in this file - which we do below.
export * from './index.client';
export * from './index.server';
export * from '@sentry/node';

import type { NodeOptions } from '@sentry/node';

import type { Client, Integration, Options, StackParser } from '@sentry/types';

import type * as clientSdk from './index.client';
import type * as serverSdk from './index.server';
import sentryAstro from './index.server';

/** Initializes Sentry Astro SDK */
export declare function init(options: Options | clientSdk.BrowserOptions | NodeOptions): Client | undefined;

export declare const linkedErrorsIntegration: typeof clientSdk.linkedErrorsIntegration;
export declare const contextLinesIntegration: typeof clientSdk.contextLinesIntegration;

export declare const getDefaultIntegrations: (options: Options) => Integration[];
export declare const defaultStackParser: StackParser;

export declare function close(timeout?: number | undefined): PromiseLike<boolean>;
export declare function flush(timeout?: number | undefined): PromiseLike<boolean>;

// eslint-disable-next-line deprecation/deprecation
export declare const getCurrentHub: typeof clientSdk.getCurrentHub;
export declare const getClient: typeof clientSdk.getClient;
export declare const continueTrace: typeof clientSdk.continueTrace;

export declare const Span: clientSdk.Span;

// eslint-disable-next-line deprecation/deprecation
export declare const metrics: typeof clientSdk.metrics & typeof serverSdk;
export default sentryAstro;
