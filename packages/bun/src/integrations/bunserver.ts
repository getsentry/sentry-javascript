import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  Transaction,
  captureException,
  continueTrace,
  convertIntegrationFnToClass,
  getCurrentScope,
  runWithAsyncContext,
  startSpan,
} from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { getSanitizedUrlString, parseUrl } from '@sentry/utils';

const INTEGRATION_NAME = 'BunServer';

const bunServerIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentBunServe();
    },
  };
}) satisfies IntegrationFn;

/**
 * Instruments `Bun.serve` to automatically create transactions and capture errors.
 */
// eslint-disable-next-line deprecation/deprecation
export const BunServer = convertIntegrationFnToClass(INTEGRATION_NAME, bunServerIntegration);

/**
 * Instruments Bun.serve by patching it's options.
 */
export function instrumentBunServe(): void {
  Bun.serve = new Proxy(Bun.serve, {
    apply(serveTarget, serveThisArg, serveArgs: Parameters<typeof Bun.serve>) {
      instrumentBunServeOptions(serveArgs[0]);
      return serveTarget.apply(serveThisArg, serveArgs);
    },
  });
}

/**
 * Instruments Bun.serve `fetch` option to automatically create spans and capture errors.
 */
function instrumentBunServeOptions(serveOptions: Parameters<typeof Bun.serve>[0]): void {
  serveOptions.fetch = new Proxy(serveOptions.fetch, {
    apply(fetchTarget, fetchThisArg, fetchArgs: Parameters<typeof serveOptions.fetch>) {
      return runWithAsyncContext(() => {
        const request = fetchArgs[0];
        const upperCaseMethod = request.method.toUpperCase();
        if (upperCaseMethod === 'OPTIONS' || upperCaseMethod === 'HEAD') {
          return fetchTarget.apply(fetchThisArg, fetchArgs);
        }

        const parsedUrl = parseUrl(request.url);
        const data: Record<string, unknown> = {
          'http.request.method': request.method || 'GET',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        };
        if (parsedUrl.search) {
          data['http.query'] = parsedUrl.search;
        }

        const url = getSanitizedUrlString(parsedUrl);

        return continueTrace(
          { sentryTrace: request.headers.get('sentry-trace') || '', baggage: request.headers.get('baggage') },
          ctx => {
            return startSpan(
              {
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.bun.serve',
                },
                op: 'http.server',
                name: `${request.method} ${parsedUrl.path || '/'}`,
                ...ctx,
                data,
                metadata: {
                  // eslint-disable-next-line deprecation/deprecation
                  ...ctx.metadata,
                  request: {
                    url,
                    method: request.method,
                    headers: request.headers.toJSON(),
                  },
                },
              },
              async span => {
                try {
                  const response = await (fetchTarget.apply(fetchThisArg, fetchArgs) as ReturnType<
                    typeof serveOptions.fetch
                  >);
                  if (response && response.status) {
                    span?.setHttpStatus(response.status);
                    span?.setAttribute('http.response.status_code', response.status);
                    if (span instanceof Transaction) {
                      const scope = getCurrentScope();
                      scope.setContext('response', {
                        headers: response.headers.toJSON(),
                        status_code: response.status,
                      });
                    }
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
