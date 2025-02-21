import type { IntegrationFn, RequestEventData, SpanAttributes } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  captureException,
  continueTrace,
  defineIntegration,
  extractQueryParamsFromUrl,
  getSanitizedUrlString,
  parseUrl,
  setHttpStatus,
  startSpan,
  withIsolationScope,
} from '@sentry/core';

const INTEGRATION_NAME = 'BunServer';

const _bunServerIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentBunServe();
    },
  };
}) satisfies IntegrationFn;

/**
 * Instruments `Bun.serve` to automatically create transactions and capture errors.
 *
 * Enabled by default in the Bun SDK.
 *
 * ```js
 * Sentry.init({
 *   integrations: [
 *     Sentry.bunServerIntegration(),
 *   ],
 * })
 * ```
 */
export const bunServerIntegration = defineIntegration(_bunServerIntegration);

/**
 * Instruments Bun.serve by patching it's options.
 */
export function instrumentBunServe(): void {
  Bun.serve = new Proxy(Bun.serve, {
    apply(serveTarget, serveThisArg, serveArgs: Parameters<typeof Bun.serve>) {
      instrumentBunServeOptions(serveArgs[0]);
      const server: ReturnType<typeof Bun.serve> = serveTarget.apply(serveThisArg, serveArgs);

      // A Bun server can be reloaded, re-wrap any fetch function passed to it
      // We can't use a Proxy for this as Bun does `instanceof` checks internally that fail if we
      // wrap the Server instance.
      const originalReload: typeof server.reload = server.reload.bind(server);
      server.reload = (serveOptions: Parameters<typeof Bun.serve>[0]) => {
        instrumentBunServeOptions(serveOptions);
        return originalReload(serveOptions);
      };

      return server;
    },
  });
}

/**
 * Instruments Bun.serve `fetch` option to automatically create spans and capture errors.
 */
function instrumentBunServeOptions(serveOptions: Parameters<typeof Bun.serve>[0]): void {
  serveOptions.fetch = new Proxy(serveOptions.fetch, {
    apply(fetchTarget, fetchThisArg, fetchArgs: Parameters<typeof serveOptions.fetch>) {
      return withIsolationScope(isolationScope => {
        const request = fetchArgs[0];
        const upperCaseMethod = request.method.toUpperCase();
        if (upperCaseMethod === 'OPTIONS' || upperCaseMethod === 'HEAD') {
          return fetchTarget.apply(fetchThisArg, fetchArgs);
        }

        const parsedUrl = parseUrl(request.url);
        const attributes: SpanAttributes = {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.bun.serve',
          [SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD]: request.method || 'GET',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        };
        if (parsedUrl.search) {
          attributes['http.query'] = parsedUrl.search;
        }

        const url = getSanitizedUrlString(parsedUrl);

        isolationScope.setSDKProcessingMetadata({
          normalizedRequest: {
            url,
            method: request.method,
            headers: request.headers.toJSON(),
            query_string: extractQueryParamsFromUrl(url),
          } satisfies RequestEventData,
        });

        return continueTrace(
          { sentryTrace: request.headers.get('sentry-trace') || '', baggage: request.headers.get('baggage') },
          () => {
            return startSpan(
              {
                attributes,
                op: 'http.server',
                name: `${request.method} ${parsedUrl.path || '/'}`,
              },
              async span => {
                try {
                  const response = await (fetchTarget.apply(fetchThisArg, fetchArgs) as ReturnType<
                    typeof serveOptions.fetch
                  >);
                  if (response?.status) {
                    setHttpStatus(span, response.status);
                    isolationScope.setContext('response', {
                      headers: response.headers.toJSON(),
                      status_code: response.status,
                    });
                  }
                  return response;
                } catch (e) {
                  captureException(e, {
                    mechanism: {
                      type: 'bun',
                      handled: false,
                      data: {
                        function: 'serve',
                      },
                    },
                  });
                  throw e;
                }
              },
            );
          },
        );
      });
    },
  });
}
