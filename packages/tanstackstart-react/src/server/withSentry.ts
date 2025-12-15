import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/node';

export type ServerEntry = { fetch?: (request: Request) => Promise<unknown> };

/**
 * This function can be used to wrap the server entry request handler to add tracing to server-side functionality.
 * You must explicitly define a server entry point in your application for this to work. This is done by passing the request handler to the `createServerEntry` function.
 * For more information about the server entry point, see the [TanStack Start documentation](https://tanstack.com/start/docs/server-entry).
 *
 * @example
 * ```ts
 * import { withSentry } from '@sentry/tanstackstart-react';
 *
 * import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
 * import type { ServerEntry } from '@tanstack/react-start/server-entry';
 *
 * const requestHandler: ServerEntry = withSentry({
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
export function withSentry(serverEntry: ServerEntry): ServerEntry {
  if (serverEntry.fetch) {
    serverEntry.fetch = new Proxy<typeof serverEntry.fetch>(serverEntry.fetch, {
      apply: async (target, thisArg, args) => {
        const request: Request = args[0];

        // instrument server functions
        if (request.url?.includes('_serverFn') || request.url?.includes('createServerFn')) {
          const op = 'function.tanstackstart';
          return await startSpan(
            {
              op: op,
              name: request.url,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.tanstackstart.serverFn',
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
              },
            },
            async () => {
              return await target.apply(thisArg, args);
            },
          );
        }

        return await target.apply(thisArg, args);
      },
    });
  }
  return serverEntry;
}
