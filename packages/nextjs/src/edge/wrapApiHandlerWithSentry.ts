import {
  captureException,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  handleCallbackErrors,
  isURLObjectRelative,
  parseStringToURLObject,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setCapturedScopesOnSpan,
  spanToJSON,
  startSpan,
  winterCGRequestToRequestData,
  withIsolationScope,
} from '@sentry/core';
import { addHeadersAsAttributes } from '../common/utils/addHeadersAsAttributes';
import { flushSafelyWithTimeout, waitUntil } from '../common/utils/responseEnd';
import type { EdgeRouteHandler } from './types';
import { URL_FULL, URL_PATH, SENTRY_OP } from '@sentry/conventions/attributes';

/**
 * Wraps a Next.js edge route handler with Sentry error and performance instrumentation.
 */
export function wrapApiHandlerWithSentry<H extends EdgeRouteHandler>(
  handler: H,
  parameterizedRoute: string,
): (...params: Parameters<H>) => Promise<ReturnType<H>> {
  return new Proxy(handler, {
    apply: async (wrappingTarget, thisArg, args: Parameters<H>) => {
      // TODO: We still should add central isolation scope creation for when our build-time instrumentation does not work anymore with turbopack.

      return withIsolationScope(isolationScope => {
        const req: unknown = args[0];
        const currentScope = getCurrentScope();

        let headerAttributes: Record<string, string> = {};

        if (req instanceof Request) {
          isolationScope.setSDKProcessingMetadata({
            normalizedRequest: winterCGRequestToRequestData(req),
          });
          currentScope.setTransactionName(`${req.method} ${parameterizedRoute}`);
          headerAttributes = addHeadersAsAttributes(req.headers);
        } else {
          currentScope.setTransactionName(`handler (${parameterizedRoute})`);
        }

        let spanName: string;
        let op: string | undefined = 'http.server';

        // If there is an active span, it likely means that the automatic Next.js OTEL instrumentation worked and we can
        // rely on that for parameterization.
        const urlObject = req instanceof Request ? parseStringToURLObject(req.url) : undefined;

        const urlAttributes = {
          [URL_FULL]: urlObject && !isURLObjectRelative(urlObject) ? urlObject.href : undefined,
          [URL_PATH]: urlObject?.pathname,
        };

        const activeSpan = getActiveSpan();
        if (activeSpan) {
          spanName = `handler (${parameterizedRoute})`;
          op = undefined;

          const rootSpan = getRootSpan(activeSpan);
          if (rootSpan) {
            const rootSpanAttributes = spanToJSON(rootSpan).data;
            rootSpan.updateName(
              req instanceof Request ? `${req.method} ${parameterizedRoute}` : `handler ${parameterizedRoute}`,
            );
            rootSpan.setAttributes({
              [SENTRY_OP]: 'http.server',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
              [URL_FULL]: rootSpanAttributes[URL_FULL] ?? urlAttributes[URL_FULL],
              [URL_PATH]: rootSpanAttributes[URL_PATH] ?? urlAttributes[URL_PATH],
              ...headerAttributes,
            });
            setCapturedScopesOnSpan(rootSpan, currentScope, isolationScope);
          }
        } else if (req instanceof Request) {
          spanName = `${req.method} ${parameterizedRoute}`;
        } else {
          spanName = `handler ${parameterizedRoute}`;
        }

        return startSpan(
          {
            name: spanName,
            op: op,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs.wrap_api_handler',
              ...urlAttributes,
              ...headerAttributes,
            },
          },
          () => {
            return handleCallbackErrors(
              () => wrappingTarget.apply(thisArg, args),
              error => {
                captureException(error, {
                  mechanism: {
                    type: 'auto.function.nextjs.wrap_api_handler',
                    handled: false,
                  },
                });
              },
              () => {
                waitUntil(flushSafelyWithTimeout());
              },
            );
          },
        );
      });
    },
  });
}
