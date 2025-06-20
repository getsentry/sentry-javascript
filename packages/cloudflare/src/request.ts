import type {
  EventPluginContext,
  ExecutionContext,
  IncomingRequestCfProperties,
  Request as CloudflareRequest,
} from '@cloudflare/workers-types';
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

interface RequestHandlerWrapperOptions<
  Env = unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Params extends string = any,
  Data extends Record<string, unknown> = Record<string, unknown>,
  // Although it is not ideal to use `any` here, it makes usage more flexible for different setups.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PluginParams = any,
> {
  options: CloudflareOptions;
  request: Request | CloudflareRequest;
  context: ExecutionContext | EventPluginContext<Env, Params, Data, PluginParams>;
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
    const cloudflareRequest = request as unknown as CloudflareRequest<unknown, IncomingRequestCfProperties>;

    // In certain situations, the passed context can become undefined.
    // For example, for Astro while prerendering pages at build time.
    // see: https://github.com/getsentry/sentry-javascript/issues/13217
    const context = wrapperOptions.context as RequestHandlerWrapperOptions['context'] | undefined;

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
      addRequest(isolationScope, cloudflareRequest);
      if (cloudflareRequest.cf) {
        addCultureContext(isolationScope, cloudflareRequest.cf as IncomingRequestCfProperties);
        attributes['network.protocol.name'] = cloudflareRequest.cf.httpProtocol;
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
