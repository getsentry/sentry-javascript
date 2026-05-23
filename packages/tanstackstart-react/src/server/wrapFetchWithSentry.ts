import { flushIfServerless, getTraceMetaTags } from '@sentry/core';
import {
  captureException,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startSpan,
} from '@sentry/node';
import { updateSpanWithRouteParametrization } from './routeParametrization';
import { extractServerFunctionSha256 } from './utils';

declare const __SENTRY_ROUTE_PATTERNS__: string[] | undefined;

export type ServerEntry = {
  fetch: (request: Request, opts?: unknown) => Promise<Response> | Response;
};

/**
 * This function optimistically assumes that the HTML coming in chunks will not be split
 * within the <head> tag. If this still happens, we simply won't replace anything.
 */
function addMetaTagToHead(htmlChunk: string, metaTagsStr: string): string {
  if (typeof htmlChunk !== 'string' || !metaTagsStr) {
    return htmlChunk;
  }

  if (htmlChunk.includes('"sentry-trace"')) {
    return htmlChunk;
  }

  // Skip quoted attribute values so we don't match <head> inside e.g. data-code="...<head>..."
  let replaced = false;
  return htmlChunk.replace(/"[^"]*"|'[^']*'|(<head>)/g, (match, headTag) => {
    if (headTag && !replaced) {
      replaced = true;
      return `<head>${metaTagsStr}`;
    }
    return match;
  });
}

function injectMetaTagsInResponse(originalResponse: Response): Response {
  try {
    const contentType = originalResponse.headers.get('content-type');

    const isPageloadRequest = contentType?.startsWith('text/html');
    if (!isPageloadRequest) {
      return originalResponse;
    }

    // Type case necessary b/c the body's ReadableStream type doesn't include
    // the async iterator that is actually available in Node
    // We later on use the async iterator to read the body chunks
    // see https://github.com/microsoft/TypeScript/issues/39051
    const originalBody = originalResponse.body as NodeJS.ReadableStream | null;
    if (!originalBody) {
      return originalResponse;
    }

    const metaTagsStr = getTraceMetaTags();
    const decoder = new TextDecoder();

    const newResponseStream = new ReadableStream({
      start: async controller => {
        // Assign to a new variable to avoid TS losing the narrower type checked above.
        const body = originalBody;

        async function* bodyReporter(): AsyncGenerator<string | Buffer> {
          try {
            for await (const chunk of body) {
              yield chunk;
            }
          } catch (e) {
            captureException(e, {
              mechanism: { type: 'auto.http.tanstackstart', handled: false },
            });
            throw e;
          }
        }

        let errored = false;
        try {
          for await (const chunk of bodyReporter()) {
            const html = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
            const modifiedHtml = addMetaTagToHead(html, metaTagsStr);
            controller.enqueue(new TextEncoder().encode(modifiedHtml));
          }
        } catch (e) {
          errored = true;
          controller.error(e);
        } finally {
          if (!errored) {
            controller.close();
          }
        }
      },
    });

    return new Response(newResponseStream, {
      status: originalResponse.status,
      statusText: originalResponse.statusText,
      headers: new Headers(originalResponse.headers),
    });
  } catch (e) {
    captureException(e, {
      mechanism: { type: 'auto.http.tanstackstart', handled: false },
    });
    throw e;
  }
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
            const functionSha256 = extractServerFunctionSha256(url.pathname);
            const op = 'function.tanstackstart';

            const serverFunctionSpanAttributes = {
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.tanstackstart.server',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
              'tanstackstart.function.hash.sha256': functionSha256,
            };

            return await startSpan(
              {
                op: op,
                name: `${method} ${url.pathname}`,
                attributes: serverFunctionSpanAttributes,
              },
              async () => {
                return target.apply(thisArg, args);
              },
            );
          }

          if (typeof __SENTRY_ROUTE_PATTERNS__ !== 'undefined') {
            updateSpanWithRouteParametrization(method, url.pathname, __SENTRY_ROUTE_PATTERNS__);
          }

          return injectMetaTagsInResponse(await target.apply(thisArg, args));
        } finally {
          await flushIfServerless();
        }
      },
    });
  }
  return serverEntry;
}
