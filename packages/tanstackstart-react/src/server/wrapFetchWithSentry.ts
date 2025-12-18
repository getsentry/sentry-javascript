import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/node';
import { extractServerFunctionSha256 } from './utils';

export type ServerEntry = {
  fetch: (request: Request, opts?: unknown) => Promise<Response> | Response;
};

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
      apply: (target, thisArg, args) => {
        const request: Request = args[0];
        const url = new URL(request.url);
        const method = request.method || 'GET';

        // instrument server functions
        if (url.pathname.includes('_serverFn') || url.pathname.includes('createServerFn')) {
          const functionSha256 = extractServerFunctionSha256(url.pathname);
          const op = 'function.tanstackstart';

          const serverFunctionSpanAttributes = {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.tanstackstart.server',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
            'tanstackstart.function.hash.sha256': functionSha256,
          };

          return startSpan(
            {
              op: op,
              name: `${method} ${url.pathname}`,
              attributes: serverFunctionSpanAttributes,
            },
            () => {
              return target.apply(thisArg, args);
            },
          );
        }

        return target.apply(thisArg, args);
      },
    });
  }
  return serverEntry;
}
