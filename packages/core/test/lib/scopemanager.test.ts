import { Scope } from '@sentry/hub';
import { Options } from '@sentry/types';

import { BaseClient } from '../../src/baseclient';
import { SimpleScopeManager } from '../../src/scopemanager';

const backendClass = Object; // we don't care about the backend

class TestClient extends BaseClient<any, Options> {
  public constructor(options: Options) {
    super(backendClass, options);
  }

  public getScope(): Scope {
    return this._scopeManager.current();
  }

  public withScope<T>(fn: (scope: Scope) => T): T {
    return this._scopeManager.withScope(fn);
  }
}

describe('SimpleScopeManager', () => {
  let client: TestClient;

  beforeEach(() => {
    client = new TestClient({ scopeManager: new SimpleScopeManager() });
  });

  test('withScope forks the current scope', () => {
    const scope = client.getScope();
    scope.setTag('outer', 'scope');
    expect(scope._tags).toEqual({ outer: 'scope' });
    let innerScope: Scope;
    client.withScope(scope => {
      innerScope = scope;
      scope.setTag('inner', 'scope');
    });
    expect(innerScope._tags).toEqual({ outer: 'scope', inner: 'scope' });
    expect(scope._tags).toEqual({ outer: 'scope' });
  });

  test('withScope returns return value from wrapped function', () => {
    const rv = client.withScope(() => 42);
    expect(rv).toEqual(42);
  });
});
