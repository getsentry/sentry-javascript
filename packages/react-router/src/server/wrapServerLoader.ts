import type { SpanAttributes } from '@sentry/core';
import {
  getActiveSpan,
  getRootSpan,
  parseStringToURLObject,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import type { LoaderFunctionArgs } from 'react-router';
import { SEMANTIC_ATTRIBUTE_SENTRY_OVERWRITE } from './instrumentation/util';

type SpanOptions = {
  name?: string;
  attributes?: SpanAttributes;
};

/**
 * Wraps a React Router server loader function with Sentry performance monitoring.
 * @param options - Optional span configuration options including name, operation, description and attributes
 * @param loaderFn - The server loader function to wrap
 *
 * @example
 * ```ts
 * // Wrap a loader function with custom span options
 * export const loader = wrapServerLoader(
 *   {
 *     name: 'Load Some Data',
 *     description: 'Loads some data from the db',
 *   },
 *   async ({ params }) => {
 *     // ... your loader logic
 *   }
 * );
 * ```
 */
export function wrapServerLoader<T>(options: SpanOptions = {}, loaderFn: (args: LoaderFunctionArgs) => Promise<T>) {
  return async function (args: LoaderFunctionArgs) {
    const name = options.name || 'Executing Server Loader';
    const active = getActiveSpan();
    if (active) {
      const root = getRootSpan(active);
      // coming from auto.http.otel.http
      if (spanToJSON(root).description === 'GET') {
        const url = parseStringToURLObject(args.request.url);

        if (url?.pathname) {
          root.setAttributes({
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
            [SEMANTIC_ATTRIBUTE_SENTRY_OVERWRITE]: `${args.request.method} ${url.pathname}`,
          });
        }
      }
    }
    return startSpan(
      {
        name,
        ...options,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react-router',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react-router.loader',
          ...options.attributes,
        },
      },
      () => loaderFn(args),
    );
  };
}
