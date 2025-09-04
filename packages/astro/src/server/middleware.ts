import type { RequestEventData, Scope, SpanAttributes } from '@sentry/core';
import {
  addNonEnumerableProperty,
  extractQueryParamsFromUrl,
  flushIfServerless,
  objectify,
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
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setHttpStatus,
  startSpan,
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
      type: 'astro',
      handled: false,
      data: {
        function: 'astroMiddleware',
      },
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
    // if there is an active span, we know that this handle call is nested and hence
    // we don't create a new domain for it. If we created one, nested server calls would
    // create new transactions instead of adding a child span to the currently active span.
    if (getActiveSpan()) {
      return instrumentRequest(ctx, next, handlerOptions);
    }
    return withIsolationScope(isolationScope => {
      return instrumentRequest(ctx, next, handlerOptions, isolationScope);
    });
  };
};

async function instrumentRequest(
  ctx: Parameters<MiddlewareResponseHandler>[0],
  next: Parameters<MiddlewareResponseHandler>[1],
  options: MiddlewareOptions,
  isolationScope?: Scope,
): Promise<Response> {
  // Make sure we don't accidentally double wrap (e.g. user added middleware and integration auto added it)
  const locals = ctx.locals as AstroLocalsWithSentry | undefined;
  if (locals?.__sentry_wrapped__) {
    return next();
  }
  if (locals) {
    addNonEnumerableProperty(locals, '__sentry_wrapped__', true);
  }

  const isDynamicPageRequest = checkIsDynamicPageRequest(ctx);

  const request = ctx.request;

  const { method, headers } = isDynamicPageRequest
    ? request
    : // headers can only be accessed in dynamic routes. Accessing `request.headers` in a static route
      // will make the server log a warning.
      { method: request.method, headers: undefined };

  return continueTrace(
    {
      sentryTrace: headers?.get('sentry-trace') || undefined,
      baggage: headers?.get('baggage'),
    },
    async () => {
      getCurrentScope().setSDKProcessingMetadata({
        // We store the request on the current scope, not isolation scope,
        // because we may have multiple requests nested inside each other
        normalizedRequest: (isDynamicPageRequest
          ? winterCGRequestToRequestData(request)
          : {
              method,
              url: request.url,
              query_string: extractQueryParamsFromUrl(request.url),
            }) satisfies RequestEventData,
      });

      if (options.trackClientIp && isDynamicPageRequest) {
        getCurrentScope().setUser({ ip_address: ctx.clientAddress });
      }

      try {
        // `routePattern` is available after Astro 5
        const contextWithRoutePattern = ctx as Parameters<MiddlewareResponseHandler>[0] & { routePattern?: string };
        const rawRoutePattern = contextWithRoutePattern.routePattern;

        // @ts-expect-error Implicit any on Symbol.for (This is available in Astro 5)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const routesFromManifest = ctx?.[Symbol.for('context.routes')]?.manifest?.routes;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const matchedRouteSegmentsFromManifest = routesFromManifest?.find(
          (route: { routeData?: { route?: string } }) => route?.routeData?.route === rawRoutePattern,
        )?.routeData?.segments;

        const parametrizedRoute =
          // Astro v5 - Joining the segments to get the correct casing of the parametrized route
          (matchedRouteSegmentsFromManifest && joinRouteSegments(matchedRouteSegmentsFromManifest)) ||
          // Fallback (Astro v4 and earlier)
          interpolateRouteFromUrlAndParams(ctx.url.pathname, ctx.params);

        const source = parametrizedRoute ? 'route' : 'url';
        // storing res in a variable instead of directly returning is necessary to
        // invoke the catch block if next() throws

        const attributes: SpanAttributes = {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.astro',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
          method,
          url: stripUrlQueryAndFragment(ctx.url.href),
        };

        if (ctx.url.search) {
          attributes['http.query'] = ctx.url.search;
        }

        if (ctx.url.hash) {
          attributes['http.fragment'] = ctx.url.hash;
        }

        isolationScope?.setTransactionName(`${method} ${parametrizedRoute || ctx.url.pathname}`);

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

              const client = getClient();
              const contentType = originalResponse.headers.get('content-type');

              const isPageloadRequest = contentType?.startsWith('text/html');
              if (!isPageloadRequest || !client) {
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
                      const modifiedHtml = addMetaTagToHead(html, parametrizedRoute);
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
          },
        );
        return res;
      } finally {
        await flushIfServerless();
      }
      // TODO: flush if serverless (first extract function)
    },
  );
}

/**
 * This function optimistically assumes that the HTML coming in chunks will not be split
 * within the <head> tag. If this still happens, we simply won't replace anything.
 */
function addMetaTagToHead(htmlChunk: string, parametrizedRoute?: string): string {
  if (typeof htmlChunk !== 'string') {
    return htmlChunk;
  }
  const metaTags = parametrizedRoute
    ? `${getTraceMetaTags()}\n<meta name="sentry-route-name" content="${encodeURIComponent(parametrizedRoute)}"/>\n`
    : getTraceMetaTags();

  if (!metaTags) {
    return htmlChunk;
  }

  const content = `<head>${metaTags}`;

  return htmlChunk.replace('<head>', content);
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
