import { SEMATTRS_HTTP_TARGET } from '@opentelemetry/semantic-conventions';
import type { SpanAttributes } from '@sentry/core';
import {
  debug,
  flushIfServerless,
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
import { DEBUG_BUILD } from '../common/debug-build';
import { isInstrumentationApiUsed } from './serverGlobals';

type SpanOptions = {
  name?: string;
  attributes?: SpanAttributes;
};

// Track if we've already warned about duplicate instrumentation
let hasWarnedAboutDuplicateLoaderInstrumentation = false;

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
export function wrapServerLoader<T>(
  options: SpanOptions = {},
  loaderFn: (args: LoaderFunctionArgs) => Promise<T>,
): (args: LoaderFunctionArgs) => Promise<T> {
  return async function (args: LoaderFunctionArgs): Promise<T> {
    // Skip instrumentation if instrumentation API is already handling it
    if (isInstrumentationApiUsed()) {
      if (DEBUG_BUILD && !hasWarnedAboutDuplicateLoaderInstrumentation) {
        hasWarnedAboutDuplicateLoaderInstrumentation = true;
        debug.warn(
          'wrapServerLoader is redundant when using the instrumentation API. ' +
            'The loader is already instrumented automatically. You can safely remove wrapServerLoader.',
        );
      }
      return loaderFn(args);
    }

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
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.loader',
          });
        }
      }
    }
    try {
      return await startSpan(
        {
          name,
          ...options,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.loader',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react_router.loader',
            ...options.attributes,
          },
        },
        () => loaderFn(args),
      );
    } finally {
      await flushIfServerless();
    }
  };
}
