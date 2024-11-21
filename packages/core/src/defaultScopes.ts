import type { Scope } from '@sentry/types';
import { Scope as ScopeClass } from './scope';
import { getGlobalSingleton } from './utils-hoist/worldwide';

/** Get the default current scope. */
export function getDefaultCurrentScope(): Scope {
  return getGlobalSingleton('defaultCurrentScope', () => new ScopeClass());
}

/** Get the default isolation scope. */
export function getDefaultIsolationScope(): Scope {
  return getGlobalSingleton('defaultIsolationScope', () => new ScopeClass());
}
