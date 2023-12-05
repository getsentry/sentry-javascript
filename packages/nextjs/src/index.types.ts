/* eslint-disable @typescript-eslint/no-explicit-any */

// We export everything from both the client part of the SDK and from the server part. Some of the exports collide,
// which is not allowed, unless we redifine the colliding exports in this file - which we do below.
export * from './config';
export * from './client';
export * from './server';
export * from './edge';

import type { Integration, Options, StackParser } from '@sentry/types';

import type * as clientSdk from './client';
import type { ServerComponentContext, VercelCronsConfig } from './common/types';
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

export declare function getSentryRelease(fallback?: string): string | undefined;

export declare const ErrorBoundary: typeof clientSdk.ErrorBoundary;
export declare const showReportDialog: typeof clientSdk.showReportDialog;
export declare const withErrorBoundary: typeof clientSdk.withErrorBoundary;

export declare const Span: typeof edgeSdk.Span;
export declare const Transaction: typeof edgeSdk.Transaction;

export { withSentryConfig } from './config';

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
 * Wraps a `getServerSideProps` function with Sentry error and performance instrumentation.
 *
 * @param origGetServerSideProps The `getServerSideProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export declare function wrapGetServerSidePropsWithSentry<F extends (...args: any[]) => any>(
  origGetServerSideProps: F,
  parameterizedRoute: string,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>>;

/**
 * @deprecated Use `wrapGetServerSidePropsWithSentry` instead.
 */
export declare function withSentryGetServerSideProps<F extends (...args: any[]) => any>(
  origGetServerSideProps: F,
  parameterizedRoute: string,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>>;

/**
 * Wraps a `getStaticProps` function with Sentry error and performance instrumentation.
 *
 * @param origGetStaticProps The `getStaticProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export declare function wrapGetStaticPropsWithSentry<F extends (...args: any[]) => any>(
  origGetStaticPropsa: F,
  parameterizedRoute: string,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>>;

/**
 * @deprecated Use `wrapGetStaticPropsWithSentry` instead.
 */
export declare function withSentryGetStaticProps<F extends (...args: any[]) => any>(
  origGetStaticPropsa: F,
  parameterizedRoute: string,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>>;

/**
 * Wraps an `app` directory server component with Sentry error and performance instrumentation.
 */
export declare function wrapServerComponentWithSentry<F extends (...args: any[]) => any>(
  WrappingTarget: F,
  context: ServerComponentContext,
): F;

/**
 * Wraps an `app` directory server component with Sentry error and performance instrumentation.
 */
export declare function wrapApiHandlerWithSentryVercelCrons<F extends (...args: any[]) => any>(
  WrappingTarget: F,
  vercelCronsConfig: VercelCronsConfig,
): F;

/**
 * Wraps a page component with Sentry error instrumentation.
 */
export declare function wrapPageComponentWithSentry<C>(WrappingTarget: C): C;

/**
 * Wraps an app directory error component with Sentry error instrumentation.
 */
export declare function wrapErrorComponentWithSentry<C>(WrappingTarget: C): C;
