import { debug } from '@sentry/core';
import type { CloudflareOptions } from '../client';
import { DEBUG_BUILD } from '../debug-build';

/**
 * Gets the effective RPC propagation setting, handling deprecation of `instrumentPrototypeMethods`.
 *
 * Priority:
 * 1. If `enableRpcTracePropagation` is set, use it (ignore `instrumentPrototypeMethods`)
 * 2. If only `instrumentPrototypeMethods` is set, use it with deprecation warning
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
