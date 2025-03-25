// We export everything from both the client part of the SDK and from the server part. Some of the exports collide,
// which is not allowed, unless we redefine the colliding exports in this file - which we do below.
export * from './config';
export * from './client';
export * from './server';
export * from './common';

import type { Client, Integration, Options, StackParser } from '@sentry/core';

import type * as clientSdk from './client';
import type * as serverSdk from './server';

/** Initializes Sentry TanStack Start SDK */
export declare function init(options: Options | clientSdk.BrowserOptions | serverSdk.NodeOptions): Client | undefined;

export declare const linkedErrorsIntegration: typeof clientSdk.linkedErrorsIntegration;
export declare const contextLinesIntegration: typeof clientSdk.contextLinesIntegration;

export declare const getDefaultIntegrations: (options: Options) => Integration[];
export declare const defaultStackParser: StackParser;

export declare function getSentryRelease(fallback?: string): string | undefined;

export declare const ErrorBoundary: typeof clientSdk.ErrorBoundary;
export declare const createReduxEnhancer: typeof clientSdk.createReduxEnhancer;
export declare const showReportDialog: typeof clientSdk.showReportDialog;
export declare const withErrorBoundary: typeof clientSdk.withErrorBoundary;

export declare const logger: typeof clientSdk.logger | typeof serverSdk.logger;
