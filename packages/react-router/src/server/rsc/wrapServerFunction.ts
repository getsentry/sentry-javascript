import {
  captureException,
  debug,
  flushIfServerless,
  getActiveSpan,
  getIsolationScope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  startSpanManual,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../common/debug-build';
import { isNotFoundResponse, isRedirectResponse } from './responseUtils';
import type { WrapServerFunctionOptions } from './types';

/**
 * Wraps a server function (marked with `"use server"` directive) with Sentry error and performance instrumentation.
 *
 * @experimental
 *
 * @example
 * ```ts
 * // actions.ts
 * "use server";
 * import { wrapServerFunction } from "@sentry/react-router";
 *
 * async function _updateUser(formData: FormData) {
 *   const userId = formData.get("id");
 *   await db.users.update(userId, { name: formData.get("name") });
 *   return { success: true };
 * }
 *
 * export const updateUser = wrapServerFunction("updateUser", _updateUser);
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapServerFunction<T extends (...args: any[]) => Promise<any>>(
  functionName: string,
  serverFunction: T,
  options: WrapServerFunctionOptions = {},
): T {
  // Auto-instrumentation wraps all exports from "use server" files, including non-function values.
  if (typeof serverFunction !== 'function') {
    DEBUG_BUILD && debug.warn(`[RSC] Not wrapping non-function export: ${functionName}`);
    return serverFunction;
  }

  DEBUG_BUILD && debug.log(`[RSC] Wrapping server function: ${functionName}`);

  return new Proxy(serverFunction, {
    apply: (originalFunction, thisArg, args) => {
      const spanName = options.name || `serverFunction/${functionName}`;

      const isolationScope = getIsolationScope();
      isolationScope.setTransactionName(spanName);

      const hasActiveSpan = !!getActiveSpan();

      // startSpanManual is used instead of startSpan because startSpan's error handler
      // would overwrite the intentional SPAN_STATUS_OK set for redirect responses.
      return startSpanManual(
        {
          name: spanName,
          forceTransaction: !hasActiveSpan,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.rsc.server_function',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.rsc.server_function',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            'rsc.server_function.name': functionName,
            ...options.attributes,
          },
        },
        async span => {
          try {
            const result = await originalFunction.apply(thisArg, args);
            span.end();
            return result;
          } catch (error) {
            if (isRedirectResponse(error)) {
              span.setStatus({ code: SPAN_STATUS_OK });
              span.end();
              throw error;
            }

            if (isNotFoundResponse(error)) {
              span.setStatus({ code: SPAN_STATUS_ERROR, message: 'not_found' });
              span.end();
              throw error;
            }

            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });

            captureException(error, {
              mechanism: {
                type: 'react_router.rsc',
                handled: false,
                data: {
                  function: 'serverFunction',
                  server_function_name: functionName,
                },
              },
            });
            span.end();
            throw error;
          } finally {
            await flushIfServerless();
          }
        },
      );
    },
  });
}
