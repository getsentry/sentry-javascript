/* eslint-disable max-lines */
import type { Span, SpanAttributes } from '@sentry/core';
import {
  addNonEnumerableProperty,
  flushIfServerless,
  getIsolationScope,
  getRootSpan,
  objectify,
  SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD,
  spanToJSON,
  stripUrlQueryAndFragment,
  winterCGRequestToRequestData,
} from '@sentry/core';
import {
  captureException,
  continueTrace,
  getActiveSpan,
  getClient,
  getCurrentScope,
  getTraceMetaTags,
  httpHeadersToSpanAttributes,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setHttpStatus,
  startSpan,
  winterCGHeadersToDict,
  withIsolationScope,
} from '@sentry/node';
import type { APIContext, MiddlewareResponseHandler, RoutePart } from 'astro';

type MiddlewareOptions = {
  /**
   * If true, the client IP will be attached to the event by calling `setUser`.
   *
   * Important: Only enable this option if your Astro app is configured for (hybrid) SSR
   * via the `output: 'server' | 'hybrid'` option in your `astro.config.mjs` file.
   * Otherwise, Astro will throw an error when starting the server.
   *
   * Only set this to `true` if you're fine with collecting potentially personally identifiable information (PII).
   *
   * @default false (recommended)
   */
  trackClientIp?: boolean;
};

function sendErrorToSentry(e: unknown): unknown {
  // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
  // store a seen flag on it.
  const objectifiedErr = objectify(e);

  captureException(objectifiedErr, {
    mechanism: {
      type: 'auto.middleware.astro',
      handled: false,
    },
  });

  return objectifiedErr;
}

type AstroLocalsWithSentry = Record<string, unknown> & {
  __sentry_wrapped__?: boolean;
};

export const handleRequest: (options?: MiddlewareOptions) => MiddlewareResponseHandler = options => {
  const handlerOptions = {
    trackClientIp: false,
    ...options,
  };

  return async (ctx, next) => {
    // If no Sentry client exists, just bail
    // Apart from the case when no Sentry.init() is called at all, this also happens
    // if a prerendered page is hit first before a ssr page is called
    // For regular prerendered pages, this is fine as we do not want to instrument them at runtime anyhow
    // BUT for server-islands requests on a static page, this can be problematic...
    // TODO: Today, this leads to inconsistent behavior: If a prerendered page is hit first (before _any_ ssr page is called),
    // Sentry.init() has not been called yet (as this is only injected in SSR pages), so server-island requests are not instrumented
    // If any SSR route is hit before, the client will already be set up and everything will work as expected :O
    // To reproduce this: Run the astro-5 "tracing.serverIslands.test" only
    if (!getClient()) {
      return next();
    }

    const isDynamicPageRequest = checkIsDynamicPageRequest(ctx);

    // For static (prerendered) routes, we only want to inject the parametrized route meta tags
    if (!isDynamicPageRequest) {
      return handleStaticRoute(ctx, next);
    }

    const activeSpan = getActiveSpan();
    const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;

    // if there is an active span, we just want to enhance it with routing data etc.
    if (rootSpan && spanToJSON(rootSpan).op === 'http.server') {
      return enhanceHttpServerSpan(ctx, next, rootSpan);
    }

    return instrumentRequestStartHttpServerSpan(ctx, next, handlerOptions);
  };
};

async function handleStaticRoute(
  ctx: Parameters<MiddlewareResponseHandler>[0],
  next: Parameters<MiddlewareResponseHandler>[1],
): Promise<Response> {
  const parametrizedRoute = getParametrizedRoute(ctx);
  try {
    const originalResponse = await next();

    // We never want to continue a trace here, so we do not inject trace data
    // But we do want to inject the parametrized route, as this is used for client-side route parametrization
    const metaTagsStr = getMetaTagsStr({ injectTraceData: false, parametrizedRoute });
    return injectMetaTagsInResponse(originalResponse, metaTagsStr);
  } catch (e) {
    sendErrorToSentry(e);
    throw e;
  }
}

async function enhanceHttpServerSpan(
  ctx: Parameters<MiddlewareResponseHandler>[0],
  next: Parameters<MiddlewareResponseHandler>[1],
  rootSpan: Span,
): Promise<Response> {
  // Make sure we don't accidentally double wrap (e.g. user added middleware and integration auto added it)
  const locals = ctx.locals as AstroLocalsWithSentry | undefined;
  if (locals?.__sentry_wrapped__) {
    return next();
  }
  if (locals) {
    addNonEnumerableProperty(locals, '__sentry_wrapped__', true);
  }

  const request = ctx.request;
  const isolationScope = getIsolationScope();
  const method = request.method;

  try {
    const parametrizedRoute = getParametrizedRoute(ctx);

    rootSpan.setAttributes({
      // This is here for backwards compatibility, we used to set this here before
      method,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.astro',
    });

    if (parametrizedRoute) {
      rootSpan.setAttributes({
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        'http.route': parametrizedRoute,
      });

      isolationScope.setTransactionName(`${method} ${parametrizedRoute}`);
    }

    try {
      const originalResponse = await next();
      const metaTagsStr = getMetaTagsStr({ injectTraceData: true, parametrizedRoute });
      return injectMetaTagsInResponse(originalResponse, metaTagsStr);
    } catch (e) {
      sendErrorToSentry(e);
      throw e;
    }
  } finally {
    await flushIfServerless();
  }
}

async function instrumentRequestStartHttpServerSpan(
  ctx: Parameters<MiddlewareResponseHandler>[0],
  next: Parameters<MiddlewareResponseHandler>[1],
  options: MiddlewareOptions,
): Promise<Response> {
  // Make sure we don't accidentally double wrap (e.g. user added middleware and integration auto added it)
  const locals = ctx.locals as AstroLocalsWithSentry | undefined;
  if (locals?.__sentry_wrapped__) {
    return next();
  }
  if (locals) {
    addNonEnumerableProperty(locals, '__sentry_wrapped__', true);
  }

  const request = ctx.request;

  // Note: We guard outside of this function call that the request is dynamic
  // accessing headers on a static route would throw
  const { method, headers } = request;

  return withIsolationScope(isolationScope => {
    return continueTrace(
      {
        sentryTrace: headers?.get('sentry-trace') || undefined,
        baggage: headers?.get('baggage'),
      },
      async () => {
        getCurrentScope().setSDKProcessingMetadata({
          // We store the request on the current scope, not isolation scope,
          // because we may have multiple requests nested inside each other
          normalizedRequest: winterCGRequestToRequestData(request),
        });

        if (options.trackClientIp) {
          isolationScope.setUser({ ip_address: ctx.clientAddress });
        }

        try {
          const parametrizedRoute = getParametrizedRoute(ctx);

          const source = parametrizedRoute ? 'route' : 'url';
          // storing res in a variable instead of directly returning is necessary to
          // invoke the catch block if next() throws

          const attributes: SpanAttributes = {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.astro',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
            [SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD]: method,
            // This is here for backwards compatibility, we used to set this here before
            method,
            url: stripUrlQueryAndFragment(ctx.url.href),
            ...httpHeadersToSpanAttributes(
              winterCGHeadersToDict(request.headers),
              getClient()?.getOptions().sendDefaultPii ?? false,
            ),
          };

          if (parametrizedRoute) {
            attributes['http.route'] = parametrizedRoute;
          }

          if (ctx.url.search) {
            attributes['http.query'] = ctx.url.search;
          }

          if (ctx.url.hash) {
            attributes['http.fragment'] = ctx.url.hash;
          }

          isolationScope.setTransactionName(`${method} ${parametrizedRoute || ctx.url.pathname}`);

          const res = await startSpan(
            {
              attributes,
              name: `${method} ${parametrizedRoute || ctx.url.pathname}`,
              op: 'http.server',
            },
            async span => {
              try {
                const originalResponse = await next();
                if (originalResponse.status) {
                  setHttpStatus(span, originalResponse.status);
                }

                const metaTagsStr = getMetaTagsStr({ injectTraceData: true, parametrizedRoute });
                return injectMetaTagsInResponse(originalResponse, metaTagsStr);
              } catch (e) {
                sendErrorToSentry(e);
                throw e;
              }
            },
          );
          return res;
        } finally {
          await flushIfServerless();
        }
        // TODO: flush if serverless (first extract function)
      },
    );
  });
}

/**
 * This function optimistically assumes that the HTML coming in chunks will not be split
 * within the <head> tag. If this still happens, we simply won't replace anything.
 */
function addMetaTagToHead(htmlChunk: string, metaTagsStr: string): string {
  if (typeof htmlChunk !== 'string' || !metaTagsStr) {
    return htmlChunk;
  }

  const content = `<head>${metaTagsStr}`;
  return htmlChunk.replace('<head>', content);
}

function getMetaTagsStr({
  injectTraceData,
  parametrizedRoute,
}: {
  injectTraceData: boolean;
  parametrizedRoute: string | undefined;
}): string {
  const parts = [];
  if (injectTraceData) {
    parts.push(getTraceMetaTags());
  }
  if (parametrizedRoute) {
    parts.push(`<meta name="sentry-route-name" content="${encodeURIComponent(parametrizedRoute)}"/>`);
  }
  return parts.join('\n');
}

/**
 * Interpolates the route from the URL and the passed params.
 * Best we can do to get a route name instead of a raw URL.
 *
 * exported for testing
 *
 * @param rawUrlPathname - The raw URL pathname, e.g. '/users/123/details'
 * @param params - The params object, e.g. `{ userId: '123' }`
 *
 * @returns The interpolated route, e.g. '/users/[userId]/details'
 */
export function interpolateRouteFromUrlAndParams(
  rawUrlPathname: string,
  params: APIContext['params'],
): string | undefined {
  const decodedUrlPathname = tryDecodeUrl(rawUrlPathname);
  if (!decodedUrlPathname) {
    return undefined;
  }

  // Invert params map so that the param values are the keys
  // differentiate between rest params spanning multiple url segments
  // and normal, single-segment params.
  const valuesToMultiSegmentParams: Record<string, string> = {};
  const valuesToParams: Record<string, string> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (!value) {
      return;
    }
    if (value.includes('/')) {
      valuesToMultiSegmentParams[value] = key;
      return;
    }
    valuesToParams[value] = key;
  });

  function replaceWithParamName(segment: string): string {
    const param = valuesToParams[segment];
    if (param) {
      return `[${param}]`;
    }
    return segment;
  }

  // before we match single-segment params, we first replace multi-segment params
  const urlWithReplacedMultiSegmentParams = Object.keys(valuesToMultiSegmentParams).reduce((acc, key) => {
    return acc.replace(key, `[${valuesToMultiSegmentParams[key]}]`);
  }, decodedUrlPathname);

  return (
    urlWithReplacedMultiSegmentParams
      .split('/')
      .map(segment => {
        if (!segment) {
          return '';
        }

        if (valuesToParams[segment]) {
          return replaceWithParamName(segment);
        }

        // astro permits multiple params in a single path segment, e.g. /[foo]-[bar]/
        const segmentParts = segment.split('-');
        if (segmentParts.length > 1) {
          return segmentParts.map(part => replaceWithParamName(part)).join('-');
        }

        return segment;
      })
      .join('/')
      // Remove trailing slash (only if it's not the only segment)
      .replace(/^(.+?)\/$/, '$1')
  );
}

function tryDecodeUrl(url: string): string | undefined {
  try {
    return decodeURI(url);
  } catch {
    return undefined;
  }
}

/**
 * Checks if the incoming request is a request for a dynamic (server-side rendered) page.
 * We can check this by looking at the middleware's `clientAddress` context property because accessing
 * this prop in a static route will throw an error which we can conveniently catch.
 */
function checkIsDynamicPageRequest(context: Parameters<MiddlewareResponseHandler>[0]): boolean {
  try {
    return context.clientAddress != null;
  } catch {
    return false;
  }
}

/**
 * Join Astro route segments into a case-sensitive single path string.
 *
 * Astro lowercases the parametrized route. Joining segments manually is recommended to get the correct casing of the routes.
 * Recommendation in comment: https://github.com/withastro/astro/issues/13885#issuecomment-2934203029
 * Function Reference: https://github.com/joanrieu/astro-typed-links/blob/b3dc12c6fe8d672a2bc2ae2ccc57c8071bbd09fa/package/src/integration.ts#L16
 */
function joinRouteSegments(segments: RoutePart[][]): string {
  const parthArray = segments.map(segment =>
    segment.map(routePart => (routePart.dynamic ? `[${routePart.content}]` : routePart.content)).join(''),
  );

  return `/${parthArray.join('/')}`;
}

function getParametrizedRoute(
  ctx: Parameters<MiddlewareResponseHandler>[0] & { routePattern?: string },
): string | undefined {
  try {
    // `routePattern` is available after Astro 5
    const contextWithRoutePattern = ctx;
    const rawRoutePattern = contextWithRoutePattern.routePattern;

    // @ts-expect-error Implicit any on Symbol.for (This is available in Astro 5)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const routesFromManifest = ctx?.[Symbol.for('context.routes')]?.manifest?.routes;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const matchedRouteSegmentsFromManifest = routesFromManifest?.find(
      (route: { routeData?: { route?: string } }) => route?.routeData?.route === rawRoutePattern,
    )?.routeData?.segments;

    return (
      // Astro v5 - Joining the segments to get the correct casing of the parametrized route
      (matchedRouteSegmentsFromManifest && joinRouteSegments(matchedRouteSegmentsFromManifest)) ||
      // Fallback (Astro v4 and earlier)
      interpolateRouteFromUrlAndParams(ctx.url.pathname, ctx.params)
    );
  } catch {
    return undefined;
  }
}

function injectMetaTagsInResponse(originalResponse: Response, metaTagsStr: string): Response {
  try {
    const contentType = originalResponse.headers.get('content-type');

    const isPageloadRequest = contentType?.startsWith('text/html');
    if (!isPageloadRequest) {
      return originalResponse;
    }

    // Type case necessary b/c the body's ReadableStream type doesn't include
    // the async iterator that is actually available in Node
    // We later on use the async iterator to read the body chunks
    // see https://github.com/microsoft/TypeScript/issues/39051
    const originalBody = originalResponse.body as NodeJS.ReadableStream | null;
    if (!originalBody) {
      return originalResponse;
    }

    const decoder = new TextDecoder();

    const newResponseStream = new ReadableStream({
      start: async controller => {
        // Assign to a new variable to avoid TS losing the narrower type checked above.
        const body = originalBody;

        async function* bodyReporter(): AsyncGenerator<string | Buffer> {
          try {
            for await (const chunk of body) {
              yield chunk;
            }
          } catch (e) {
            // Report stream errors coming from user code or Astro rendering.
            sendErrorToSentry(e);
            throw e;
          }
        }

        try {
          for await (const chunk of bodyReporter()) {
            const html = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
            const modifiedHtml = addMetaTagToHead(html, metaTagsStr);
            controller.enqueue(new TextEncoder().encode(modifiedHtml));
          }
        } catch (e) {
          controller.error(e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(newResponseStream, originalResponse);
  } catch (e) {
    sendErrorToSentry(e);
    throw e;
  }
}
