// We export everything from both the client part of the SDK and from the server part. Some of the exports collide,
// which is not allowed, unless we redefine the colliding exports in this file - which we do below.
export * from './index.client';
export * from './index.server';

import type { Client, Integration, Options, StackParser } from '@sentry/types';

import * as clientSdk from './index.client';
import * as serverSdk from './index.server';
import type { RemixOptions } from './utils/remixOptions';

/** Initializes Sentry Remix SDK */
export declare function init(options: RemixOptions): Client | undefined;

export declare const linkedErrorsIntegration: typeof clientSdk.linkedErrorsIntegration;
export declare const contextLinesIntegration: typeof clientSdk.contextLinesIntegration;

export declare const getDefaultIntegrations: (options: Options) => Integration[];
export declare const defaultStackParser: StackParser;

export declare function captureRemixServerException(
  err: unknown,
  name: string,
  request: Request,
  isRemixV2?: boolean,
): Promise<void>;

// This variable is not a runtime variable but just a type to tell typescript that the methods below can either come
// from the client SDK or from the server SDK. TypeScript is smart enough to understand that these resolve to the same
// methods from `@sentry/core`.
declare const runtime: 'client' | 'server';

// eslint-disable-next-line deprecation/deprecation
export declare const getCurrentHub: typeof clientSdk.getCurrentHub;
export declare const getClient: typeof clientSdk.getClient;
export declare const continueTrace: typeof clientSdk.continueTrace;

export const close = runtime === 'client' ? clientSdk.close : serverSdk.close;
export const flush = runtime === 'client' ? clientSdk.flush : serverSdk.flush;
export const lastEventId = runtime === 'client' ? clientSdk.lastEventId : serverSdk.lastEventId;

// eslint-disable-next-line deprecation/deprecation
export declare const metrics: typeof clientSdk.metrics & typeof serverSdk.metrics;
