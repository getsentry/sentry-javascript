import type { ExecutionContext, IncomingRequestCfProperties } from '@cloudflare/workers-types';
import type { SpanAttributes } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_URL_FULL,
  captureException,
  continueTrace,
  flush,
  setHttpStatus,
  startSpan,
  stripUrlQueryAndFragment,
  withIsolationScope,
} from '@sentry/core';
import type { CloudflareOptions } from './client';
import { addCloudResourceContext, addCultureContext, addRequest } from './scope-utils';
import { init } from './sdk';

interface RequestHandlerWrapperOptions {
  options: CloudflareOptions;
  request: Request<unknown, IncomingRequestCfProperties<unknown>>;
  context: ExecutionContext;
}

/**
 * Wraps a cloudflare request handler in Sentry instrumentation
 */
export function wrapRequestHandler(
  wrapperOptions: RequestHandlerWrapperOptions,
  handler: (...args: unknown[]) => Response | Promise<Response>,
): Promise<Response> {
  return withIsolationScope(async isolationScope => {
    const { options, request } = wrapperOptions;

    // In certain situations, the passed context can become undefined.
    // For example, for Astro while prerendering pages at build time.
    // see: https://github.com/getsentry/sentry-javascript/issues/13217
    const context = wrapperOptions.context as ExecutionContext | undefined;

    const client = init(options);
    isolationScope.setClient(client);

    const attributes: SpanAttributes = {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.cloudflare',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
      [SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD]: request.method,
      [SEMANTIC_ATTRIBUTE_URL_FULL]: request.url,
    };

    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      attributes['http.request.body.size'] = parseInt(contentLength, 10);
    }

    let pathname = '';
    try {
      const url = new URL(request.url);
      pathname = url.pathname;
      attributes['server.address'] = url.hostname;
      attributes['url.scheme'] = url.protocol.replace(':', '');
    } catch {
      // skip
    }

    addCloudResourceContext(isolationScope);
    if (request) {
      addRequest(isolationScope, request);
      if (request.cf) {
        addCultureContext(isolationScope, request.cf);
        attributes['network.protocol.name'] = request.cf.httpProtocol;
      }
    }

    const routeName = `${request.method} ${pathname ? stripUrlQueryAndFragment(pathname) : '/'}`;

    return continueTrace(
      { sentryTrace: request.headers.get('sentry-trace') || '', baggage: request.headers.get('baggage') },
      () => {
        // Note: This span will not have a duration unless I/O happens in the handler. This is
        // because of how the cloudflare workers runtime works.
        // See: https://developers.cloudflare.com/workers/runtime-apis/performance/
        return startSpan(
          {
            name: routeName,
            attributes,
          },
          async span => {
            try {
              const res = await handler();
              setHttpStatus(span, res.status);
              return res;
            } catch (e) {
              captureException(e, { mechanism: { handled: false, type: 'cloudflare' } });
              throw e;
            } finally {
              context?.waitUntil(flush(2000));
            }
          },
        );
      },
    );
  });
}
