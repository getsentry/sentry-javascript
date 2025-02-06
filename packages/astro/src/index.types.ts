/* eslint-disable import/export */

// We export everything from both the client part of the SDK and from the server part.
// Some of the exports collide, which is not allowed, unless we redefine the colliding
// exports in this file - which we do below.
import type { Client, Integration, Options, StackParser } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';
import type * as clientSdk from './index.client';
import type * as serverSdk from './index.server';
import sentryAstro from './index.server';

export * from './index.client';
export * from './index.server';
export * from '@sentry/node';

/** Initializes Sentry Astro SDK */
export declare function init(options: Options | clientSdk.BrowserOptions | NodeOptions): Client | undefined;
export declare function initWithDefaultIntegrations(
  options: Options | clientSdk.BrowserOptions | NodeOptions,
  getDefaultIntegrations: (options: Options) => Integration[],
): Client | undefined;

export declare const linkedErrorsIntegration: typeof clientSdk.linkedErrorsIntegration;
export declare const contextLinesIntegration: typeof clientSdk.contextLinesIntegration;

export declare const getDefaultIntegrations: (options: Options) => Integration[];
export declare const defaultStackParser: StackParser;

export declare function close(timeout?: number | undefined): PromiseLike<boolean>;
export declare function flush(timeout?: number | undefined): PromiseLike<boolean>;

export declare const Span: clientSdk.Span;

export declare const logger: typeof clientSdk.logger | typeof serverSdk.logger;

export default sentryAstro;
