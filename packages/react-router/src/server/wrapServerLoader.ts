import { SEMATTRS_HTTP_TARGET } from '@opentelemetry/semantic-conventions';
import type { SpanAttributes } from '@sentry/core';
import {
  getActiveSpan,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanToJSON,
  startSpan,
  updateSpanName,
} from '@sentry/core';
import type { LoaderFunctionArgs } from 'react-router';

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
      const spanData = spanToJSON(root);
      if (spanData.origin === 'auto.http.otel.http') {
        // eslint-disable-next-line deprecation/deprecation
        const target = spanData.data[SEMATTRS_HTTP_TARGET];

        if (target) {
          // We cannot rely on the regular span name inferral here, as the express instrumentation sets `*` as the route
          // So we force this to be a more sensible name here
          updateSpanName(root, `${args.request.method} ${target}`);
          root.setAttributes({
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react-router.loader',
          });
        }
      }
    }
    return startSpan(
      {
        name,
        ...options,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react-router.loader',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react-router.loader',
          ...options.attributes,
        },
      },
      () => loaderFn(args),
    );
  };
}
