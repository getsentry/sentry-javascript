import { debug } from '@sentry/core';
import type { CloudflareOptions } from '../client';
import { DEBUG_BUILD } from '../debug-build';

/**
 * Gets the effective RPC propagation setting, handling deprecation of `instrumentPrototypeMethods`.
 *
 * Priority:
 * 1. If `enableRpcTracePropagation` is set, use it (ignore `instrumentPrototypeMethods`)
 * 2. If only `instrumentPrototypeMethods` is set, use it with deprecation warning (converted to boolean)
 * 3. If neither is set, return `false`
 *
 * @returns The effective setting for RPC trace propagation
 */
export function getEffectiveRpcPropagation(options: CloudflareOptions): boolean {
  const { enableRpcTracePropagation, instrumentPrototypeMethods } = options;

  // If the new option is explicitly set, use it
  if (enableRpcTracePropagation !== undefined) {
    if (instrumentPrototypeMethods !== undefined) {
      DEBUG_BUILD &&
        debug.warn(
          '[Sentry] Both `enableRpcTracePropagation` and `instrumentPrototypeMethods` are set. ' +
            'Using `enableRpcTracePropagation` and ignoring `instrumentPrototypeMethods`.',
        );
    }
    return enableRpcTracePropagation;
  }

  // Fall back to deprecated option with warning
  if (instrumentPrototypeMethods !== undefined) {
    DEBUG_BUILD &&
      debug.warn(
        '[Sentry] `instrumentPrototypeMethods` is deprecated and will be removed in a future major version. ' +
          'Please use `enableRpcTracePropagation` instead.',
      );
    // instrumentPrototypeMethods can be boolean or string[], convert to boolean
    return (
      instrumentPrototypeMethods === true ||
      (Array.isArray(instrumentPrototypeMethods) && instrumentPrototypeMethods.length > 0)
    );
  }

  return false;
}

/**
 * Gets the method filter for prototype method instrumentation.
 *
 * Returns:
 * - `null` if no instrumentation should occur
 * - `true` if all methods should be instrumented
 * - `string[]` if only specific methods should be instrumented (deprecated behavior)
 *
 * @returns The method filter or null if no instrumentation
 */
export function getPrototypeMethodFilter(options: CloudflareOptions): boolean | string[] {
  const { enableRpcTracePropagation, instrumentPrototypeMethods } = options;

  // If the new option is explicitly set, use it (boolean only, no filtering)
  if (enableRpcTracePropagation !== undefined) {
    return !!enableRpcTracePropagation;
  }

  // Fall back to deprecated option - preserve array filtering behavior
  if (instrumentPrototypeMethods !== undefined) {
    if (instrumentPrototypeMethods === true) {
      return true;
    }

    if (Array.isArray(instrumentPrototypeMethods) && instrumentPrototypeMethods.length > 0) {
      return instrumentPrototypeMethods;
    }

    return false;
  }

  return false;
}
