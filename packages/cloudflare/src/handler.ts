import type {
  ExportedHandler,
  ExportedHandlerFetchHandler,
  IncomingRequestCfProperties,
} from '@cloudflare/workers-types';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  captureException,
  continueTrace,
  flush,
  setHttpStatus,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import type { Options, Scope, SpanAttributes } from '@sentry/types';
import { stripUrlQueryAndFragment, winterCGRequestToRequestData } from '@sentry/utils';
import { setAsyncLocalStorageAsyncContextStrategy } from './async';
import { init } from './sdk';

/**
 * Extract environment generic from exported handler.
 */
type ExtractEnv<P> = P extends ExportedHandler<infer Env> ? Env : never;

/**
 * Wrapper for Cloudflare handlers.
 *
 * Initializes the SDK and wraps the handler with Sentry instrumentation.
 *
 * Automatically instruments the `fetch` method of the handler.
 *
 * @param optionsCallback Function that returns the options for the SDK initialization.
 * @param handler {ExportedHandler} The handler to wrap.
 * @returns The wrapped handler.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withSentry<E extends ExportedHandler<any>>(
  optionsCallback: (env: ExtractEnv<E>) => Options,
  handler: E,
): E {
  setAsyncLocalStorageAsyncContextStrategy();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  if ('fetch' in handler && typeof handler.fetch === 'function' && !(handler.fetch as any).__SENTRY_INSTRUMENTED__) {
    handler.fetch = new Proxy(handler.fetch, {
      apply(target, thisArg, args: Parameters<ExportedHandlerFetchHandler<ExtractEnv<E>>>) {
        const [request, env, context] = args;
        return withIsolationScope(isolationScope => {
          const options = optionsCallback(env);
          const client = init(options);
          isolationScope.setClient(client);

          const attributes: SpanAttributes = {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.cloudflare-worker',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
            ['http.request.method']: request.method,
            ['url.full']: request.url,
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

          addRequest(isolationScope, request);
          addCloudResourceContext(isolationScope);
          if (request.cf) {
            addCultureContext(isolationScope, request.cf);
            attributes['network.protocol.name'] = request.cf.httpProtocol;
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
                    const res = await (target.apply(thisArg, args) as ReturnType<typeof target>);
                    setHttpStatus(span, res.status);
                    return res;
                  } catch (e) {
                    captureException(e, { mechanism: { handled: false } });
                    throw e;
                  } finally {
                    context.waitUntil(flush(2000));
                  }
                },
              );
            },
          );
        });
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    (handler.fetch as any).__SENTRY_INSTRUMENTED__ = true;
  }

  return handler;
}

function addCloudResourceContext(isolationScope: Scope): void {
  isolationScope.setContext('cloud_resource', {
    'cloud.provider': 'cloudflare',
  });
}

function addCultureContext(isolationScope: Scope, cf: IncomingRequestCfProperties): void {
  isolationScope.setContext('culture', {
    timezone: cf.timezone,
  });
}

function addRequest(isolationScope: Scope, request: Request): void {
  isolationScope.setSDKProcessingMetadata({ request: winterCGRequestToRequestData(request) });
}
