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
import type { ActionFunctionArgs } from 'react-router';
import { SEMANTIC_ATTRIBUTE_SENTRY_OVERWRITE } from './instrumentation/util';

type SpanOptions = {
  name?: string;
  attributes?: SpanAttributes;
};

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
export function wrapServerAction<T>(options: SpanOptions = {}, actionFn: (args: ActionFunctionArgs) => Promise<T>) {
  return async function (args: ActionFunctionArgs) {
    const name = options.name || 'Executing Server Action';
    const active = getActiveSpan();
    if (active) {
      const root = getRootSpan(active);
      // coming from auto.http.otel.http
      if (spanToJSON(root).description === 'POST') {
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
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react-router.action',
          ...options.attributes,
        },
      },
      () => actionFn(args),
    );
  };
}
