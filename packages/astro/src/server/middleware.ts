import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  captureException,
  continueTrace,
  getActiveSpan,
  getClient,
  getCurrentScope,
  setHttpStatus,
  startSpan,
  withIsolationScope,
} from '@sentry/node';
import type { Client, Scope, Span, SpanAttributes } from '@sentry/types';
import { addNonEnumerableProperty, objectify, stripUrlQueryAndFragment } from '@sentry/utils';
import type { APIContext, MiddlewareResponseHandler } from 'astro';

import { getTracingMetaTags } from './meta';

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
    return withIsolationScope(() => {
      return instrumentRequest(ctx, next, handlerOptions);
    });
  };
};

async function instrumentRequest(
  ctx: Parameters<MiddlewareResponseHandler>[0],
  next: Parameters<MiddlewareResponseHandler>[1],
  options: MiddlewareOptions,
): Promise<Response> {
  // Make sure we don't accidentally double wrap (e.g. user added middleware and integration auto added it)
  const locals = ctx.locals as AstroLocalsWithSentry;
  if (locals && locals.__sentry_wrapped__) {
    return next();
  }
  addNonEnumerableProperty(locals, '__sentry_wrapped__', true);

  const { method, headers } = ctx.request;

  return continueTrace(
    {
      sentryTrace: headers.get('sentry-trace') || undefined,
      baggage: headers.get('baggage'),
    },
    async () => {
      // We store this on the current scope, not isolation scope,
      // because we may have multiple requests nested inside each other
      getCurrentScope().setSDKProcessingMetadata({ request: ctx.request });

      if (options.trackClientIp) {
        getCurrentScope().setUser({ ip_address: ctx.clientAddress });
      }

      try {
        const interpolatedRoute = interpolateRouteFromUrlAndParams(ctx.url.pathname, ctx.params);
        const source = interpolatedRoute ? 'route' : 'url';
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

        const res = await startSpan(
          {
            attributes,
            name: `${method} ${interpolatedRoute || ctx.url.pathname}`,
            op: 'http.server',
          },
          async span => {
            const originalResponse = await next();

            if (span && originalResponse.status) {
              setHttpStatus(span, originalResponse.status);
            }

            const scope = getCurrentScope();
            const client = getClient();
            const contentType = originalResponse.headers.get('content-type');

            const isPageloadRequest = contentType && contentType.startsWith('text/html');
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
                for await (const chunk of originalBody) {
                  const html = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
                  const modifiedHtml = addMetaTagToHead(html, scope, client, span);
                  controller.enqueue(new TextEncoder().encode(modifiedHtml));
                }
                controller.close();
              },
            });

            return new Response(newResponseStream, originalResponse);
          },
        );
        return res;
      } catch (e) {
        sendErrorToSentry(e);
        throw e;
      }
      // TODO: flush if serverless (first extract function)
    },
  );
}

/**
 * This function optimistically assumes that the HTML coming in chunks will not be split
 * within the <head> tag. If this still happens, we simply won't replace anything.
 */
function addMetaTagToHead(htmlChunk: string, scope: Scope, client: Client, span?: Span): string {
  if (typeof htmlChunk !== 'string') {
    return htmlChunk;
  }

  const { sentryTrace, baggage } = getTracingMetaTags(span, scope, client);
  const content = `<head>\n${sentryTrace}\n${baggage}\n`;
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

  return urlWithReplacedMultiSegmentParams
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
    .join('/');
}

function tryDecodeUrl(url: string): string | undefined {
  try {
    return decodeURI(url);
  } catch {
    return undefined;
  }
}
