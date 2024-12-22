import { getGlobalSingleton } from './carrier';
import { Scope } from './scope';

/** Get the default current scope. */
export function getDefaultCurrentScope(): Scope {
  return getGlobalSingleton('defaultCurrentScope', () => new Scope());
}

/** Get the default isolation scope. */
export function getDefaultIsolationScope(): Scope {
  return getGlobalSingleton('defaultIsolationScope', () => new Scope());
}
