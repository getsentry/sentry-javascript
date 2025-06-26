import type { ExecutionContext, IncomingRequestCfProperties } from '@cloudflare/workers-types';
import type { Span } from '@sentry/core';
import {
  captureException,
  continueTrace,
  flush,
  getHttpSpanDetailsFromUrlObject,
  parseStringToURLObject,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  setHttpStatus,
  startSpan,
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

    const urlObject = parseStringToURLObject(request.url);
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(urlObject, 'server', 'auto.http.cloudflare', request);

    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      attributes['http.request.body.size'] = parseInt(contentLength, 10);
    }

    attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] = 'http.server';

    addCloudResourceContext(isolationScope);
    if (request) {
      addRequest(isolationScope, request);
      if (request.cf) {
        addCultureContext(isolationScope, request.cf);
        attributes['network.protocol.name'] = request.cf.httpProtocol;
      }
    }

    // Do not capture spans for OPTIONS and HEAD requests
    if (request.method === 'OPTIONS' || request.method === 'HEAD') {
      try {
        return await handler();
      } catch (e) {
        captureException(e, { mechanism: { handled: false, type: 'cloudflare' } });
        throw e;
      } finally {
        context?.waitUntil(flush(2000));
      }
    }

    return continueTrace(
      { sentryTrace: request.headers.get('sentry-trace') || '', baggage: request.headers.get('baggage') },
      () => {
        // Note: This span will not have a duration unless I/O happens in the handler. This is
        // because of how the cloudflare workers runtime works.
        // See: https://developers.cloudflare.com/workers/runtime-apis/performance/
        return startSpan(
          {
            name,
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
