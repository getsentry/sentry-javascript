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
  startSpan,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../common/debug-build';
import { isAlreadyCaptured, isNotFoundResponse, isRedirectResponse } from './responseUtils';
import type { WrapServerFunctionOptions } from './types';

/**
 * Wraps a server function (marked with `"use server"` directive) with Sentry error and performance instrumentation.
 *
 * @experimental This API is experimental and may change in minor releases.
 * React Router RSC support requires React Router v7.9.0+ with `unstable_reactRouterRSC()`.
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
  DEBUG_BUILD && debug.log(`[RSC] Wrapping server function: ${functionName}`);

  return new Proxy(serverFunction, {
    apply: (originalFunction, thisArg, args) => {
      const spanName = options.name || `serverFunction/${functionName}`;

      const isolationScope = getIsolationScope();
      isolationScope.setTransactionName(spanName);

      const hasActiveSpan = !!getActiveSpan();

      return startSpan(
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
            return result;
          } catch (error) {
            if (isRedirectResponse(error)) {
              span.setStatus({ code: SPAN_STATUS_OK });
              throw error;
            }

            if (isNotFoundResponse(error)) {
              span.setStatus({ code: SPAN_STATUS_ERROR, message: 'not_found' });
              throw error;
            }

            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });

            if (!isAlreadyCaptured(error)) {
              captureException(error, {
                mechanism: {
                  type: 'instrument',
                  handled: false,
                  data: {
                    function: 'serverFunction',
                    server_function_name: functionName,
                  },
                },
              });
            }
            throw error;
          } finally {
            await flushIfServerless();
          }
        },
      );
    },
  });
}
