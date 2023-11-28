import { Transaction, captureException, continueTrace, runWithAsyncContext, startSpan } from '@sentry/core';
import type { Integration } from '@sentry/types';
import { getSanitizedUrlString, parseUrl } from '@sentry/utils';

/**
 * Instruments `Bun.serve` to automatically create transactions and capture errors.
 */
export class BunServer implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'BunServer';

  /**
   * @inheritDoc
   */
  public name: string = BunServer.id;

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    instrumentBunServe();
  }
}

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
                op: 'http.server',
                name: `${request.method} ${parsedUrl.path || '/'}`,
                origin: 'auto.http.bun.serve',
                ...ctx,
                data,
                metadata: {
                  ...ctx.metadata,
                  source: 'url',
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
                    span?.setData('http.response.status_code', response.status);
                    if (span instanceof Transaction) {
                      span.setContext('response', {
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
