import { Scope } from './scope';

/**
 * A object that manages Scopes with different strategies.
 */
export interface ScopeManager {
  getCurrentScope(): Scope;

  // Mutates current global scope.
  configureScope<T>(cb: (scope: Scope) => T): T;

  // Forks current scope
  // Forking behaviour is based scope manager implementation
  withScope<T>(cb: (scope: Scope) => T): T;
}
