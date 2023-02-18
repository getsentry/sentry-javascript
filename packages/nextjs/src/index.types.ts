/* eslint-disable import/export */

// We export everything from both the client part of the SDK and from the server part. Some of the exports collide,
// which is not allowed, unless we redifine the colliding exports in this file - which we do below.
export * from './config';
export * from './client';
export * from './server';
export * from './edge';

import type { Integration, Options, StackParser } from '@sentry/types';

import type * as clientSdk from './client';
import type * as edgeSdk from './edge';
import type * as serverSdk from './server';

/** Initializes Sentry Next.js SDK */
export declare function init(
  options: Options | clientSdk.BrowserOptions | serverSdk.NodeOptions | edgeSdk.EdgeOptions,
): void;

// We export a merged Integrations object so that users can (at least typing-wise) use all integrations everywhere.
export declare const Integrations: typeof clientSdk.Integrations &
  typeof serverSdk.Integrations &
  typeof edgeSdk.Integrations;

export declare const defaultIntegrations: Integration[];
export declare const defaultStackParser: StackParser;

export declare function close(timeout?: number | undefined): PromiseLike<boolean>;
export declare function flush(timeout?: number | undefined): PromiseLike<boolean>;
export declare function lastEventId(): string | undefined;
export declare function getSentryRelease(fallback?: string): string | undefined;

export declare const ErrorBoundary: typeof clientSdk.ErrorBoundary;
export declare const showReportDialog: typeof clientSdk.showReportDialog;
export declare const withErrorBoundary: typeof clientSdk.withErrorBoundary;

export declare const Span: typeof edgeSdk.Span;

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

/**
 * Wraps a `getInitialProps` function with Sentry error and performance instrumentation.
 *
 * @param getInitialProps The `getInitialProps` function
 * @returns A wrapped version of the function
 */
export declare function wrapGetInitialPropsWithSentry<F extends (...args: any[]) => any>(
  getInitialProps: F,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>>;

/**
 * @deprecated Use `wrapGetInitialPropsWithSentry` instead.
 */
export declare function withSentryServerSideGetInitialProps<F extends (...args: any[]) => any>(
  getInitialProps: F,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>>;

/**
 * Wraps a `getInitialProps` function of a custom `_app` page with Sentry error and performance instrumentation.
 *
 * @param getInitialProps The `getInitialProps` function
 * @returns A wrapped version of the function
 */
export declare function wrapAppGetInitialPropsWithSentry<F extends (...args: any[]) => any>(
  getInitialProps: F,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>>;

/**
 * @deprecated Use `wrapAppGetInitialPropsWithSentry` instead.
 */
export declare function withSentryServerSideAppGetInitialProps<F extends (...args: any[]) => any>(
  getInitialProps: F,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>>;

/**
 * Wraps a `getInitialProps` function of a custom `_document` page with Sentry error and performance instrumentation.
 *
 * @param getInitialProps The `getInitialProps` function
 * @returns A wrapped version of the function
 */
export declare function wrapDocumentGetInitialPropsWithSentry<F extends (...args: any[]) => any>(
  getInitialProps: F,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>>;

/**
 * @deprecated Use `wrapDocumentGetInitialPropsWithSentry` instead.
 */
export declare function withSentryServerSideDocumentGetInitialProps<F extends (...args: any[]) => any>(
  getInitialProps: F,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>>;

/**
 * Wraps a `getInitialProps` function of a custom `_error` page with Sentry error and performance instrumentation.
 *
 * @param getInitialProps The `getInitialProps` function
 * @returns A wrapped version of the function
 */
export declare function wrapErrorGetInitialPropsWithSentry<F extends (...args: any[]) => any>(
  getInitialProps: F,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>>;

/**
 * @deprecated Use `wrapErrorGetInitialPropsWithSentry` instead.
 */
export declare function withSentryServerSideErrorGetInitialProps<F extends (...args: any[]) => any>(
  getInitialProps: F,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>>;

/**
 * Wraps an `app` directory component with Sentry error instrumentation. (Currently only reports errors for server components)
 */
export declare function wrapAppDirComponentWithSentry<F extends (...args: any[]) => any>(WrappingTarget: F): F;
