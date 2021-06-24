import { ScopeManager } from '@sentry/types';

import { Scope } from './scope';

/**
 *
 */
export class SimpleScopeManager implements ScopeManager {
  private _current: Scope;

  public constructor(scope?: Scope) {
    this._current = scope === undefined ? new Scope() : scope;
  }

  /**
   *
   */
  public getCurrentScope(): Scope {
    return this._current;
  }

  /**
   *
   */
  public updateScope(scope: Scope): void {
    this._current = this._current.update(scope);
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
}
