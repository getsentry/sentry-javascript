import { context } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import {
  escapeStringForRegex,
  flushIfServerless,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  updateSpanName,
} from '@sentry/core';
import type { AppLoadContext, EntryContext, RouterContextProvider } from 'react-router';
import { isInstrumentationApiUsed } from './serverGlobals';

type OriginalHandleRequestWithoutMiddleware = (
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: AppLoadContext,
) => Promise<unknown>;

type OriginalHandleRequestWithMiddleware = (
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) => Promise<unknown>;

/**
 * Wraps the original handleRequest function to add Sentry instrumentation.
 *
 * @param originalHandle - The original handleRequest function to wrap
 * @returns A wrapped version of the handle request function with Sentry instrumentation
 */
export function wrapSentryHandleRequest(
  originalHandle: OriginalHandleRequestWithoutMiddleware,
): OriginalHandleRequestWithoutMiddleware;
/**
 * Wraps the original handleRequest function to add Sentry instrumentation.
 *
 * @param originalHandle - The original handleRequest function to wrap
 * @returns A wrapped version of the handle request function with Sentry instrumentation
 */
export function wrapSentryHandleRequest(
  originalHandle: OriginalHandleRequestWithMiddleware,
): OriginalHandleRequestWithMiddleware;
/**
 * Wraps the original handleRequest function to add Sentry instrumentation.
 *
 * @param originalHandle - The original handleRequest function to wrap
 * @returns A wrapped version of the handle request function with Sentry instrumentation
 */
export function wrapSentryHandleRequest(
  originalHandle: OriginalHandleRequestWithoutMiddleware | OriginalHandleRequestWithMiddleware,
): OriginalHandleRequestWithoutMiddleware | OriginalHandleRequestWithMiddleware {
  return async function sentryInstrumentedHandleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext,
    loadContext: AppLoadContext | RouterContextProvider,
  ) {
    const parameterizedPath =
      routerContext?.staticHandlerContext?.matches?.[routerContext.staticHandlerContext.matches.length - 1]?.route.path;

    // When staticHandlerContext.matches doesn't provide a route,
    // fall back to matching the request URL against the route manifest.
    const resolvedPath = parameterizedPath ?? matchUrlToManifestRoute(request.url, routerContext);

    const activeSpan = getActiveSpan();
    const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;

    if (resolvedPath && rootSpan) {
      // Normalize route name - avoid "//" for root routes
      const routeName = resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`;

      // The express instrumentation writes on the rpcMetadata and that ends up stomping on the `http.route` attribute.
      const rpcMetadata = getRPCMetadata(context.active());

      if (rpcMetadata?.type === RPCType.HTTP) {
        rpcMetadata.route = routeName;
      }

      const transactionName = `${request.method} ${routeName}`;

      updateSpanName(rootSpan, transactionName);
      getCurrentScope().setTransactionName(transactionName);

      // Set route attributes - acts as fallback for lazy-only routes when using instrumentation API
      // Don't override origin when instrumentation API is used (preserve instrumentation_api origin)
      if (isInstrumentationApiUsed()) {
        rootSpan.setAttributes({
          [ATTR_HTTP_ROUTE]: routeName,
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        });
      } else {
        rootSpan.setAttributes({
          [ATTR_HTTP_ROUTE]: routeName,
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.request_handler',
        });
      }
    }

    try {
      // Type guard to call the correct overload based on loadContext type
      if (isRouterContextProvider(loadContext)) {
        // loadContext is RouterContextProvider
        return await (originalHandle as OriginalHandleRequestWithMiddleware)(
          request,
          responseStatusCode,
          responseHeaders,
          routerContext,
          loadContext,
        );
      } else {
        // loadContext is AppLoadContext
        return await (originalHandle as OriginalHandleRequestWithoutMiddleware)(
          request,
          responseStatusCode,
          responseHeaders,
          routerContext,
          loadContext,
        );
      }
    } finally {
      await flushIfServerless();
    }

    /**
     * Helper type guard to determine if the context is a RouterContextProvider.
     *
     * @param ctx - The context to check
     * @returns True if the context is a RouterContextProvider
     */
    function isRouterContextProvider(ctx: AppLoadContext | RouterContextProvider): ctx is RouterContextProvider {
      return typeof (ctx as RouterContextProvider)?.get === 'function';
    }
  };
}

// todo(v11): remove this
/** @deprecated Use `wrapSentryHandleRequest` instead. */
export const sentryHandleRequest = wrapSentryHandleRequest;

/**
 * Resolves the full parameterized path for a route by walking up the parent chain.
 */
function resolveFullRoutePath(
  routeId: string,
  routes: Record<string, { path?: string; parentId?: string } | undefined>,
): string | undefined {
  const parts: string[] = [];
  let currentId: string | undefined = routeId;
  while (currentId) {
    const route: { path?: string; parentId?: string } | undefined = routes[currentId];
    if (!route) break;
    if (route.path) {
      parts.unshift(route.path);
    }
    currentId = route.parentId;
  }
  if (parts.length === 0) return undefined;
  const joined = parts.join('/');
  return joined.startsWith('/') ? joined : `/${joined}`;
}

const PARAM_RE = /^:[\w-]+$/;
const STATIC_SEGMENT_SCORE = 10;
const DYNAMIC_SEGMENT_SCORE = 3;
const EMPTY_SEGMENT_SCORE = 1;
const SPLAT_PENALTY = -2;

/**
 * Computes a specificity score for a route pattern.
 * Matches React Router's computeScore() algorithm.
 */
function computeScore(pattern: string): number {
  const segments = pattern.split('/');
  let score = segments.length;
  if (segments.includes('*')) {
    score += SPLAT_PENALTY;
  }
  for (const segment of segments) {
    if (segment === '*') continue;
    else if (PARAM_RE.test(segment)) score += DYNAMIC_SEGMENT_SCORE;
    else if (segment === '') score += EMPTY_SEGMENT_SCORE;
    else score += STATIC_SEGMENT_SCORE;
  }
  return score;
}

/**
 * Matches a request URL against the route manifest to find the parameterized route path.
 * Used as a fallback when staticHandlerContext.matches is empty.
 */
function matchUrlToManifestRoute(
  requestUrl: string,
  routerContext: {
    manifest?: { routes?: Record<string, { path?: string; parentId?: string; index?: boolean } | undefined> };
  },
): string | undefined {
  const routes = routerContext?.manifest?.routes;
  if (!routes) return undefined;

  let pathname: string;
  try {
    pathname = new URL(requestUrl).pathname;
  } catch {
    return undefined;
  }

  // Strip trailing slash for consistent matching (e.g. /rsc/server-component/ → /rsc/server-component)
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  const routePaths: string[] = [];
  for (const id of Object.keys(routes)) {
    const fullPath = resolveFullRoutePath(id, routes);
    if (fullPath) {
      routePaths.push(fullPath);
    }
  }

  routePaths.sort((a, b) => computeScore(b) - computeScore(a));

  for (const fullPath of routePaths) {
    const segments = fullPath.split('/');
    const regexSegments = segments.map(seg => {
      if (seg === '*') return '.*';
      if (seg.startsWith(':')) return '[^/]+';
      return escapeStringForRegex(seg);
    });
    const hasWildcard = segments.includes('*');
    const regexStr = `^${regexSegments.join('/')}${hasWildcard ? '' : '$'}`;
    // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor -- route patterns from manifest, not user input
    if (new RegExp(regexStr).test(pathname)) {
      return fullPath;
    }
  }

  return undefined;
}
