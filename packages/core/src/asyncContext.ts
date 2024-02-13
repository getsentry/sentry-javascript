import type { Hub, Integration } from '@sentry/types';
import { GLOBAL_OBJ } from '@sentry/utils';

export interface RunWithAsyncContextOptions {
  /** Whether to reuse an existing async context if one exists. Defaults to false. */
  reuseExisting?: boolean;
}

/**
 * @private Private API with no semver guarantees!
 *
 * Strategy used to track async context.
 */
export interface AsyncContextStrategy {
  /**
   * Gets the current async context. Returns undefined if there is no current async context.
   */
  getCurrentHub: () => Hub | undefined;

  /**
   * Runs the supplied callback in its own async context.
   */
  runWithAsyncContext<T>(callback: () => T, options: RunWithAsyncContextOptions): T;
}

/**
 * An object that contains a hub and maintains a scope stack.
 * @hidden
 */
export interface Carrier {
  __SENTRY__?: SentryCarrier;
}

interface SentryCarrier {
  hub?: Hub;
  acs?: AsyncContextStrategy;
  /**
   * Extra Hub properties injected by various SDKs
   */
  integrations?: Integration[];
  extensions?: {
    /** Extension methods for the hub, which are bound to the current Hub instance */
    // eslint-disable-next-line @typescript-eslint/ban-types
    [key: string]: Function;
  };
}

/**
 * Returns the global shim registry.
 *
 * FIXME: This function is problematic, because despite always returning a valid Carrier,
 * it has an optional `__SENTRY__` property, which then in turn requires us to always perform an unnecessary check
 * at the call-site. We always access the carrier through this function, so we can guarantee that `__SENTRY__` is there.
 **/
export function getMainCarrier(): Carrier {
  // This ensures a Sentry carrier exists
  getSentryCarrier(GLOBAL_OBJ);
  return GLOBAL_OBJ;
}

/**
 * @private Private API with no semver guarantees!
 *
 * Sets the global async context strategy
 */
export function setAsyncContextStrategy(strategy: AsyncContextStrategy | undefined): void {
  // Get main carrier (global for every environment)
  const registry = getMainCarrier();
  const sentry = getSentryCarrier(registry);
  sentry.acs = strategy;
}

/** Will either get the existing sentry carrier, or create a new one. */
export function getSentryCarrier(carrier: Carrier): SentryCarrier {
  if (!carrier.__SENTRY__) {
    carrier.__SENTRY__ = {
      extensions: {},
      hub: undefined,
    };
  }
  return carrier.__SENTRY__;
}
