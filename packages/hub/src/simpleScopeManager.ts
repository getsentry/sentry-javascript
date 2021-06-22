import { ScopeManager } from '@sentry/types';

import { Scope } from './scope';

/**
 *
 */
export class SimpleScopeManager implements ScopeManager {
  private _current: Scope = new Scope();

  /**
   *
   */
  public getCurrentScope(): Scope {
    return this._current;
  }

  /**
   *
   */
  public withScope<T>(fn: (scope: Scope) => T): T {
    // public withScope<T>(scope: Scope, fn: (scope: Scope) => T): T {
    // TODO: optional Scope as second argument
    const oldScope = this.getCurrentScope();
    const newScope = Scope.clone(this._current);
    this._current = newScope;
    try {
      return fn(newScope);
    } finally {
      this._current = oldScope;
    }
  }

  /**
   *
   */
  public configureScope<T>(fn: (scope: Scope) => T): T {
    return fn(this.getCurrentScope());
  }
}
