import { Scope } from '@sentry/hub';
import { ScopeManager } from '@sentry/types';

/**
 *
 */
export class SimpleScopeManager implements ScopeManager {
  private _current: Scope = new Scope();

  /**
   *
   */
  public current(): Scope {
    return this._current;
  }

  /**
   *
   */
  public withScope<T>(fn: (scope: Scope) => T): T {
    // public withScope<T>(scope: Scope, fn: (scope: Scope) => T): T {
    // TODO: optional Scope as second argument
    return fn(Scope.clone(this._current));
  }
}
