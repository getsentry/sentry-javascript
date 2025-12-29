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
import type { ActionFunctionArgs } from 'react-router';
import { DEBUG_BUILD } from '../common/debug-build';
import { isInstrumentationApiUsed } from './serverGlobals';

type SpanOptions = {
  name?: string;
  attributes?: SpanAttributes;
};

// Track if we've already warned about duplicate instrumentation
let hasWarnedAboutDuplicateActionInstrumentation = false;

/**
 * Wraps a React Router server action function with Sentry performance monitoring.
 * @param options - Optional span configuration options including name, operation, description and attributes
 * @param actionFn - The server action function to wrap
 *
 * @example
 * ```ts
 * // Wrap an action function with custom span options
 * export const action = wrapServerAction(
 *   {
 *     name: 'Submit Form Data',
 *     description: 'Processes form submission data',
 *   },
 *   async ({ request }) => {
 *     // ... your action logic
 *   }
 * );
 * ```
 */
export function wrapServerAction<T>(
  options: SpanOptions = {},
  actionFn: (args: ActionFunctionArgs) => Promise<T>,
): (args: ActionFunctionArgs) => Promise<T> {
  return async function (args: ActionFunctionArgs): Promise<T> {
    // Skip instrumentation if instrumentation API is already handling it
    if (isInstrumentationApiUsed()) {
      if (DEBUG_BUILD && !hasWarnedAboutDuplicateActionInstrumentation) {
        hasWarnedAboutDuplicateActionInstrumentation = true;
        debug.warn(
          'wrapServerAction is redundant when using the instrumentation API. ' +
            'The action is already instrumented automatically. You can safely remove wrapServerAction.',
        );
      }
      return actionFn(args);
    }

    const name = options.name || 'Executing Server Action';
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
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.action',
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
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.action',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react_router.action',
            ...options.attributes,
          },
        },
        () => actionFn(args),
      );
    } finally {
      await flushIfServerless();
    }
  };
}
