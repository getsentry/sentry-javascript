import type { SpanAttributes } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startSpan,
} from '@sentry/node';
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

        let op: string;
        let spanAttributes: SpanAttributes;

        if (url.pathname.includes('_serverFn') || url.pathname.includes('createServerFn')) {
          // server function call
          op = 'function.tanstackstart';
          const functionSha256 = extractServerFunctionSha256(url.pathname);
          spanAttributes = {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.tanstackstart.server',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
            'tanstackstart.function.hash.sha256': functionSha256,
          };
        } else {
          // API route or other server request
          op = 'http.server';
          spanAttributes = {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.tanstackstart.server',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
            [SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD]: method,
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          };
        }

        return startSpan(
          {
            op,
            name: `${method} ${url.pathname}`,
            attributes: spanAttributes,
          },
          () => {
            return target.apply(thisArg, args);
          },
        );
      },
    });
  }
  return serverEntry;
}
