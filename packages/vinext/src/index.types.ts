import type { Client, Integration, Options, StackParser } from '@sentry/core';
import type * as clientSdk from './client';
import type * as serverSdk from './server';

/** Initializes Sentry vinext SDK */
export declare function init(options: Options | clientSdk.BrowserOptions | serverSdk.NodeOptions): Client | undefined;

export declare const linkedErrorsIntegration: typeof clientSdk.linkedErrorsIntegration;
export declare const contextLinesIntegration: typeof clientSdk.contextLinesIntegration;

export declare const getDefaultIntegrations: (options: Options) => Integration[];
export declare const defaultStackParser: StackParser;

export declare function getSentryRelease(fallback?: string): string | undefined;

export declare const ErrorBoundary: typeof clientSdk.ErrorBoundary;
export declare const showReportDialog: typeof clientSdk.showReportDialog;
export declare const withErrorBoundary: typeof clientSdk.withErrorBoundary;

export declare const logger: typeof clientSdk.logger | typeof serverSdk.logger;

export { captureRequestError } from './server/captureRequestError';
export { sentryVinext, type SentryVinextPluginOptions } from './vite';

export {
  wrapRouteHandlerWithSentry,
  wrapServerComponentWithSentry,
  wrapMiddlewareWithSentry,
  wrapApiHandlerWithSentry,
} from './common';

export type { ErrorContext, RequestInfo } from './common';

// Re-export from client
export { browserTracingIntegration } from './client';

// Re-export from server
export { init as serverInit } from './server';
