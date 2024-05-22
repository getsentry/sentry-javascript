import type { Scope } from '@sentry/types';
import { getGlobalSingleton } from '@sentry/utils';
import { Scope as ScopeClass } from './scope';

/** Get the default current scope. */
export function getDefaultCurrentScope(): Scope {
  return getGlobalSingleton('defaultCurrentScope', () => new ScopeClass());
}

/** Get the default isolation scope. */
export function getDefaultIsolationScope(): Scope {
  return getGlobalSingleton('defaultIsolationScope', () => new ScopeClass());
}
