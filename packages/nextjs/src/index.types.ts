/* eslint-disable import/export */

// We export everything from both the client part of the SDK and from the server part. Some of the exports collide,
// which is not allowed, unless we redifine the colliding exports in this file - which we do below.
export * from './config';
export * from './client';
export * from './server';
export * from './edge';

import type { Integration, Options, StackParser } from '@sentry/types';

import type { BrowserOptions } from './client';
import * as clientSdk from './client';
import type { EdgeOptions } from './edge';
import * as edgeSdk from './edge';
import type { NodeOptions } from './server';
import * as serverSdk from './server';

/** Initializes Sentry Next.js SDK */
export declare function init(options: Options | BrowserOptions | NodeOptions | EdgeOptions): void;

// We export a merged Integrations object so that users can (at least typing-wise) use all integrations everywhere.
export const Integrations = { ...clientSdk.Integrations, ...serverSdk.Integrations, ...edgeSdk.Integrations };

export declare const defaultIntegrations: Integration[];
export declare const defaultStackParser: StackParser;

export declare function close(timeout?: number | undefined): PromiseLike<boolean>;
export declare function flush(timeout?: number | undefined): PromiseLike<boolean>;
export declare function lastEventId(): string | undefined;
export declare function getSentryRelease(fallback?: string): string | undefined;

/**
 * @deprecated Use `wrapApiHandlerWithSentry` instead
 */
export declare function withSentryAPI<APIHandler extends (...args: any[]) => any>(
  handler: APIHandler,
  parameterizedRoute: string,
): (
  ...args: Parameters<APIHandler>
) => ReturnType<APIHandler> extends Promise<unknown> ? ReturnType<APIHandler> : Promise<ReturnType<APIHandler>>;

/**
 * Wraps a Next.js API handler with Sentry error and performance instrumentation.
 *
 * @param handler The handler exported from the API route file.
 * @param parameterizedRoute The page's parameterized route.
 * @returns The wrapped handler.
 */
export declare function wrapApiHandlerWithSentry<APIHandler extends (...args: any[]) => any>(
  handler: APIHandler,
  parameterizedRoute: string,
): (
  ...args: Parameters<APIHandler>
) => ReturnType<APIHandler> extends Promise<unknown> ? ReturnType<APIHandler> : Promise<ReturnType<APIHandler>>;
