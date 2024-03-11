import type { Hub, Integration } from '@sentry/types';
import type { Scope } from '@sentry/types';
import { GLOBAL_OBJ } from '@sentry/utils';
import type { startInactiveSpan, startSpan, startSpanManual, withActiveSpan } from './tracing/trace';
import type { getActiveSpan } from './utils/spanUtils';

/**
 * @private Private API with no semver guarantees!
 *
 * Strategy used to track async context.
 */
export interface AsyncContextStrategy {
  /**
   * Gets the currently active hub.
   */
  getCurrentHub: () => Hub;

  /**
   * Fork the isolation scope inside of the provided callback.
   */
  withIsolationScope: <T>(callback: (isolationScope: Scope) => T) => T;

  /**
   * Fork the current scope inside of the provided callback.
   */
  withScope: <T>(callback: (isolationScope: Scope) => T) => T;

  /**
   * Set the provided scope as the current scope inside of the provided callback.
   */
  withSetScope: <T>(scope: Scope, callback: (scope: Scope) => T) => T;

  /**
   * Set the provided isolation as the current isolation scope inside of the provided callback.
   */
  withSetIsolationScope: <T>(isolationScope: Scope, callback: (isolationScope: Scope) => T) => T;

  /**
   * Get the currently active scope.
   */
  getCurrentScope: () => Scope;

  /**
   * Get the currently active isolation scope.
   */
  getIsolationScope: () => Scope;

  // OPTIONAL: Custom tracing methods
  // These are used so that we can provide OTEL-based implementations

  /** Start an active span. */
  startSpan?: typeof startSpan;

  /** Start an inactive span. */
  startInactiveSpan?: typeof startInactiveSpan;

  /** Start an active manual span. */
  startSpanManual?: typeof startSpanManual;

  /** Get the currently active span. */
  getActiveSpan?: typeof getActiveSpan;

  /** Make a span the active span in the context of the callback. */
  withActiveSpan?: typeof withActiveSpan;
}

/**
 * An object that contains a hub and maintains a scope stack.
 * @hidden
 */
export interface Carrier {
  __SENTRY__?: SentryCarrier;
}

interface SentryCarrier {
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
    };
  }
  return carrier.__SENTRY__;
}
