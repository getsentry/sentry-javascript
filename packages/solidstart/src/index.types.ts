/* eslint-disable import/export */

// We export everything from both the client part of the SDK and from the server part.
// Some of the exports collide, which is not allowed, unless we redefine the colliding
// exports in this file - which we do below.
import type { Client, Integration, Options, StackParser } from '@sentry/core';
import type * as clientSdk from './client';
import type * as serverSdk from './server';

export * from './client';
export * from './server';
export * from './config';

/** Initializes Sentry Solid Start SDK */
export declare function init(options: Options | clientSdk.BrowserOptions | serverSdk.NodeOptions): Client | undefined;

export declare const linkedErrorsIntegration: typeof clientSdk.linkedErrorsIntegration;
export declare const contextLinesIntegration: typeof clientSdk.contextLinesIntegration;

export declare const getDefaultIntegrations: (options: Options) => Integration[];
export declare const defaultStackParser: StackParser;

export declare function close(timeout?: number | undefined): PromiseLike<boolean>;
export declare function flush(timeout?: number | undefined): PromiseLike<boolean>;
export declare function lastEventId(): string | undefined;

export declare const logger: typeof clientSdk.logger | typeof serverSdk.logger;
