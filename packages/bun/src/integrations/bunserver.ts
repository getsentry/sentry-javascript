import { captureException, getCurrentHub, runWithAsyncContext, startSpan, Transaction } from '@sentry/core';
import type { Integration } from '@sentry/types';
import {
  addExceptionMechanism,
  getSanitizedUrlString,
  objectify,
  parseUrl,
  tracingContextFromHeaders,
} from '@sentry/utils';

function sendErrorToSentry(e: unknown): unknown {
  // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
  // store a seen flag on it.
  const objectifiedErr = objectify(e);

  captureException(objectifiedErr, scope => {
    scope.addEventProcessor(event => {
      addExceptionMechanism(event, {
        type: 'bun',
        handled: false,
        data: {
          function: 'serve',
        },
      });
      return event;
    });

    return scope;
  });

  return objectifiedErr;
}

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
        const hub = getCurrentHub();
        const options = hub.getClient()?.getOptions();

        const request = fetchArgs[0];
        const upperCaseMethod = request.method.toUpperCase();
        if (!options || upperCaseMethod === 'OPTIONS' || upperCaseMethod === 'HEAD') {
          return fetchTarget.apply(fetchThisArg, fetchArgs);
        }

        const sentryTrace = request.headers.get('sentry-trace') || '';
        const baggage = request.headers.get('baggage');
        const { traceparentData, dynamicSamplingContext, propagationContext } = tracingContextFromHeaders(
          sentryTrace,
          baggage,
        );
        hub.getScope().setPropagationContext(propagationContext);

        const parsedUrl = parseUrl(request.url);
        const data: Record<string, unknown> = {
          'http.request.method': request.method || 'GET',
        };
        if (parsedUrl.search) {
          data['http.query'] = parsedUrl.search;
        }

        const url = getSanitizedUrlString(parsedUrl);
        return startSpan(
          {
            op: 'http.server',
            name: `${request.method} ${parsedUrl.path || '/'}`,
            origin: 'auto.http.bun.serve',
            ...traceparentData,
            data,
            metadata: {
              source: 'url',
              dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
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
              sendErrorToSentry(e);
              throw e;
            }
          },
        );
      });
    },
  });
}
