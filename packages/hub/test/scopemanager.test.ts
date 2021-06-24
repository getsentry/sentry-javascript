import { ScopeManager } from '@sentry/types';

import { getMainCarrier, Scope } from '../src';
import { getCurrentScope, getCurrentScopeManager, registerScopeManager } from '../src/hub';
import { SimpleScopeManager } from '../src/simplescopemanager';

class TestScopeManager implements ScopeManager {
  private _current: Scope = new Scope();

  public getCurrentScope(): Scope {
    return this._current;
  }

  public updateScope(scope: Scope): void {
    this._current = this._current.update(scope);
  }

  public withScope<T>(fn: (scope: Scope) => T): T {
    return fn(this._current);
  }
}

describe('Global Scope Manager', () => {
  beforeEach(() => {
    const carrier = getMainCarrier();
    if (carrier.__SENTRY__) {
      carrier.__SENTRY__.scopeManager = new SimpleScopeManager();
    }
  });

  test('get a scope manager from the global carrier', () => {
    const scopeManager = getCurrentScopeManager();
    const currentScope = scopeManager.getCurrentScope();
    currentScope.setTag('tag1', 'tag2');

    expect(getCurrentScope()).toEqual(currentScope);
  });

  test('set a scope manager on the global carrier', () => {
    const testScopeManager = new TestScopeManager();
    registerScopeManager(testScopeManager);
    expect(getCurrentScopeManager()).toEqual(testScopeManager);
  });
});
