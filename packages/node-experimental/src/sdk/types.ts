import type { Hub, Integration } from '@sentry/types';
import type { Scope } from './scope';

export interface CurrentScopes {
  scope: Scope;
  isolationScope: Scope;
}

/**
 * Strategy used to track async context.
 */
export interface AsyncContextStrategy {
  /**
   * Gets the current async context. Returns undefined if there is no current async context.
   */
  getScopes: () => CurrentScopes | undefined;

  /** This is here for legacy reasons. */
  getCurrentHub: () => Hub;

  /**
   * Runs the supplied callback in its own async context.
   */
  runWithAsyncContext<T>(callback: () => T): T;
}

export interface SentryCarrier {
  globalScope?: Scope;
  scopes?: CurrentScopes;
  acs?: AsyncContextStrategy;

  // hub is here for legacy reasons
  hub?: Hub;

  extensions?: {
    /** Extension methods for the hub, which are bound to the current Hub instance */
    // eslint-disable-next-line @typescript-eslint/ban-types
    [key: string]: Function;
  };

  integrations?: Integration[];
}
