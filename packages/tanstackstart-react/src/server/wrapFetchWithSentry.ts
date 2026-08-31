import { flushIfServerless, getTraceMetaTags } from '@sentry/core';
import { captureException, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/node';
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { FUNCTION } from '@sentry/conventions/op';
import { injectHtmlIntoHead } from '@sentry/server-utils';
import { updateSpanWithRouteParametrization } from './routeParametrization';

declare const __SENTRY_ROUTE_PATTERNS__: string[] | undefined;

export type ServerEntry = {
  // `opts` is forwarded verbatim to the wrapped handler, so this must accept whatever shape
  // the real framework entry uses (e.g. TanStack's `RequestOptions<Register>`). Under
  // parameter contravariance `unknown` would reject such an entry; `any` keeps it assignable.
  // oxlint-disable-next-line typescript/no-explicit-any
  fetch: (request: Request, opts?: any) => Promise<Response> | Response;
};

function reportStreamError(error: unknown): void {
  captureException(error, {
    mechanism: { type: 'auto.http.tanstackstart', handled: false },
  });
}

/**
 * This function can be used to wrap the server entry request handler to add tracing to server-side functionality.
 * You must explicitly define a server entry point in your application for this to work. This is done by passing the request handler to the `createServerEntry` function.
 * For more information about the server entry point, see the [TanStack Start documentation](https://tanstack.com/start/docs/server-entry).
 *
 * @example
 * ```ts
 * import { wrapFetchWithSentry } from '@sentry/tanstackstart-react';
 *
 * import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
 * import type { ServerEntry } from '@tanstack/react-start/server-entry';
 *
 * const requestHandler: ServerEntry = wrapFetchWithSentry({
 *  fetch(request: Request) {
 *    return handler.fetch(request);
 *  },
 * });
 *
 * export default serverEntry = createServerEntry(requestHandler);
 * ```
 *
 * @param serverEntry - request handler to wrap
 * @returns - wrapped request handler
 */
export function wrapFetchWithSentry(serverEntry: ServerEntry): ServerEntry {
  if (serverEntry.fetch) {
    serverEntry.fetch = new Proxy<typeof serverEntry.fetch>(serverEntry.fetch, {
      async apply(target, thisArg, args) {
        try {
          const request: Request = args[0];
          const url = new URL(request.url);
          const method = request.method || 'GET';

          // instrument server functions
          if (url.pathname.includes('_serverFn') || url.pathname.includes('createServerFn')) {
            return await startSpan(
              {
                name: `${method} ${url.pathname}`,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.tanstackstart.server',
                  [SENTRY_OP]: FUNCTION,
                },
              },
              async () => {
                return target.apply(thisArg, args);
              },
            );
          }

          if (typeof __SENTRY_ROUTE_PATTERNS__ !== 'undefined') {
            updateSpanWithRouteParametrization(method, url.pathname, __SENTRY_ROUTE_PATTERNS__);
          }

          return injectHtmlIntoHead(await target.apply(thisArg, args), getTraceMetaTags(), reportStreamError);
        } finally {
          await flushIfServerless();
        }
      },
    });
  }
  return serverEntry;
}
