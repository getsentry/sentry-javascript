import { Scope } from './scope';

export interface ScopeManager {
  current(): Scope;
  withScope<T>(fn: (scope: Scope) => T): T;
}
