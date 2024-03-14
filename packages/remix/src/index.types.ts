// We export everything from both the client part of the SDK and from the server part. Some of the exports collide,
// which is not allowed, unless we redifine the colliding exports in this file - which we do below.
export * from './index.client';
export * from './index.server';

import type { Integration, Options, StackParser } from '@sentry/types';

import * as clientSdk from './index.client';
import * as serverSdk from './index.server';
import type { RemixOptions } from './utils/remixOptions';

/** Initializes Sentry Remix SDK */
export declare function init(options: RemixOptions): void;

// We export a merged Integrations object so that users can (at least typing-wise) use all integrations everywhere.
// eslint-disable-next-line deprecation/deprecation
export declare const Integrations: typeof clientSdk.Integrations;

export declare const linkedErrorsIntegration: typeof clientSdk.linkedErrorsIntegration;
export declare const contextLinesIntegration: typeof clientSdk.contextLinesIntegration;

export declare const getDefaultIntegrations: (options: Options) => Integration[];
export declare const defaultStackParser: StackParser;

// This variable is not a runtime variable but just a type to tell typescript that the methods below can either come
// from the client SDK or from the server SDK. TypeScript is smart enough to understand that these resolve to the same
// methods from `@sentry/core`.
declare const runtime: 'client' | 'server';

// eslint-disable-next-line deprecation/deprecation
export declare const makeMain: typeof clientSdk.makeMain;
// eslint-disable-next-line deprecation/deprecation
export declare const getCurrentHub: typeof clientSdk.getCurrentHub;
export declare const getClient: typeof clientSdk.getClient;
export declare const continueTrace: typeof clientSdk.continueTrace;

export const close = runtime === 'client' ? clientSdk.close : serverSdk.close;
export const flush = runtime === 'client' ? clientSdk.flush : serverSdk.flush;

export declare const metrics: typeof clientSdk.metrics & typeof serverSdk.metrics;
