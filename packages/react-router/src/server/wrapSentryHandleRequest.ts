import { context } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import {
  flush,
  getActiveSpan,
  getRootSpan,
  getTraceMetaTags,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  vercelWaitUntil,
} from '@sentry/core';
import type { AppLoadContext, EntryContext } from 'react-router';
import type { PassThrough } from 'stream';
import { Transform } from 'stream';

type OriginalHandleRequest = (
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: AppLoadContext,
) => Promise<unknown>;

/**
 * Wraps the original handleRequest function to add Sentry instrumentation.
 *
 * @param originalHandle - The original handleRequest function to wrap
 * @returns A wrapped version of the handle request function with Sentry instrumentation
 */
export function wrapSentryHandleRequest(originalHandle: OriginalHandleRequest): OriginalHandleRequest {
  return async function sentryInstrumentedHandleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext,
    loadContext: AppLoadContext,
  ) {
    const parameterizedPath =
      routerContext?.staticHandlerContext?.matches?.[routerContext.staticHandlerContext.matches.length - 1]?.route.path;

    const activeSpan = getActiveSpan();
    const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;

    if (parameterizedPath && rootSpan) {
      const routeName = `/${parameterizedPath}`;

      // The express instrumentation writes on the rpcMetadata and that ends up stomping on the `http.route` attribute.
      const rpcMetadata = getRPCMetadata(context.active());

      if (rpcMetadata?.type === RPCType.HTTP) {
        rpcMetadata.route = routeName;
      }

      // The span exporter picks up the `http.route` (ATTR_HTTP_ROUTE) attribute to set the transaction name
      rootSpan.setAttributes({
        [ATTR_HTTP_ROUTE]: routeName,
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react-router.request-handler',
      });
    }

    try {
      return await originalHandle(request, responseStatusCode, responseHeaders, routerContext, loadContext);
    } finally {
      vercelWaitUntil(flush());
    }
  };
}

// todo(v11): remove this
/** @deprecated Use `wrapSentryHandleRequest` instead. */
export const sentryHandleRequest = wrapSentryHandleRequest;

/**
 * Injects Sentry trace meta tags into the HTML response by piping through a transform stream.
 * This enables distributed tracing by adding trace context to the HTML document head.
 *
 * @param body - PassThrough stream containing the HTML response body to modify
 */
export function getMetaTagTransformer(body: PassThrough): Transform {
  const headClosingTag = '</head>';
  const htmlMetaTagTransformer = new Transform({
    transform(chunk, _encoding, callback) {
      const html = Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
      if (html.includes(headClosingTag)) {
        const modifiedHtml = html.replace(headClosingTag, `${getTraceMetaTags()}${headClosingTag}`);
        callback(null, modifiedHtml);
        return;
      }
      callback(null, chunk);
    },
  });
  htmlMetaTagTransformer.pipe(body);
  return htmlMetaTagTransformer;
}
