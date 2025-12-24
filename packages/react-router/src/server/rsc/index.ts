/**
 * React Server Components (RSC) instrumentation for React Router.
 *
 * This module provides wrappers for React Router's unstable RSC APIs (v7.9.0+)
 * to enable Sentry error capture and performance tracing.
 *
 * @example
 * ```typescript
 * // Server-side RSC entry
 * import {
 *   wrapMatchRSCServerRequest,
 *   wrapRouteRSCServerRequest,
 *   wrapServerFunction,
 *   wrapServerComponent,
 * } from "@sentry/react-router";
 * ```
 */

// RSC Server entry wrapper
export { wrapMatchRSCServerRequest } from './wrapMatchRSCServerRequest';

// SSR Server entry wrapper
export { wrapRouteRSCServerRequest } from './wrapRouteRSCServerRequest';

// Server function wrapper ("use server")
export { wrapServerFunction, wrapServerFunctions } from './wrapServerFunction';

// Server component wrapper
export { wrapServerComponent, isServerComponentContext } from './wrapServerComponent';

// Type exports
export type {
  // RSC API types
  RSCRouteConfigEntry,
  RSCPayload,
  RSCMatch,
  DecodedPayload,
  RouterContextProvider,
  // Function types
  DecodeReplyFunction,
  DecodeActionFunction,
  DecodeFormStateFunction,
  LoadServerActionFunction,
  SSRCreateFromReadableStreamFunction,
  BrowserCreateFromReadableStreamFunction,
  // Argument types
  MatchRSCServerRequestArgs,
  MatchRSCServerRequestFn,
  RouteRSCServerRequestArgs,
  RouteRSCServerRequestFn,
  RSCHydratedRouterProps,
  // Context types
  ServerComponentContext,
  WrapServerFunctionOptions,
} from './types';
