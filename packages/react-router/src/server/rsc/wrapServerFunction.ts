import {
  captureException,
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
import { isAlreadyCaptured, isNotFoundResponse, isRedirectResponse, safeFlushServerless } from './responseUtils';
import type { WrapServerFunctionOptions } from './types';

/**
 * Wraps a server function (marked with `"use server"` directive) with Sentry error and performance instrumentation.
 *
 * @experimental This API is experimental and may change in minor releases.
 * React Router RSC support requires React Router v7.9.0+ with `unstable_reactRouterRSC()`.
 *
 * @param functionName - The name of the server function for identification in Sentry
 * @param serverFunction - The server function to wrap
 * @param options - Optional configuration for the span
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
  const wrappedFunction = async function (this: unknown, ...args: Parameters<T>): Promise<ReturnType<T>> {
    const spanName = options.name || `serverFunction/${functionName}`;

    const isolationScope = getIsolationScope();
    isolationScope.setTransactionName(spanName);

    // Check for active span to determine if this should be a new transaction or child span
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
          const result = await serverFunction.apply(this, args);
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
          safeFlushServerless(flushIfServerless);
        }
      },
    );
  };

  // Preserve the function name for debugging
  Object.defineProperty(wrappedFunction, 'name', {
    value: `sentryWrapped_${functionName}`,
    configurable: true,
  });

  return wrappedFunction as T;
}

/**
 * Creates a wrapped version of a server function module.
 * Useful for wrapping all exported server functions from a module.
 *
 * @experimental This API is experimental and may change in minor releases.
 * React Router RSC support requires React Router v7.9.0+ with `unstable_reactRouterRSC()`.
 *
 * @param moduleName - The name of the module for identification
 * @param serverFunctions - An object containing server functions
 * @returns An object with all functions wrapped
 *
 * @example
 * ```typescript
 * // actions.ts
 * "use server";
 * import { wrapServerFunctions } from "@sentry/react-router";
 *
 * async function createUser(data: FormData) { ... }
 * async function updateUser(data: FormData) { ... }
 * async function deleteUser(id: string) { ... }
 *
 * export const actions = wrapServerFunctions("userActions", {
 *   createUser,
 *   updateUser,
 *   deleteUser,
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapServerFunctions<T extends Record<string, (...args: any[]) => Promise<any>>>(
  moduleName: string,
  serverFunctions: T,
): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapped: Record<string, (...args: any[]) => Promise<any>> = {};

  for (const [name, fn] of Object.entries(serverFunctions)) {
    if (typeof fn === 'function') {
      wrapped[name] = wrapServerFunction(`${moduleName}.${name}`, fn);
    } else {
      wrapped[name] = fn;
    }
  }

  return wrapped as T;
}
