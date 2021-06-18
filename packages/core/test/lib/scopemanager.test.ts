import { Scope } from '@sentry/hub';
import { Options } from '@sentry/types';

import { BaseClient } from '../../src/baseclient';
import { SimpleScopeManager } from '../../src/scopemanager';

const backendClass = Object; // we don't care about the backend

class TestClient extends BaseClient<any, Options> {
  public constructor(options: Options) {
    super(backendClass, options);
  }
}

describe('Client + SimpleScopeManager', () => {
  let client: TestClient;

  beforeEach(() => {
    client = new TestClient({ scopeManager: new SimpleScopeManager() });
  });

  test('getScope returns mutable scope', () => {
    const scope = client.getScope();
    scope.setTag('key', 'value');
    expect(scope._tags).toEqual({ key: 'value' });
    expect(client.getScope()).toEqual(scope);
  });

  test('withScope returns return value from wrapped function', () => {
    const rv = client.withScope(() => 42);
    expect(rv).toEqual(42);
  });

  test('withScope forks the current scope', () => {
    const outerScope = client.getScope();
    outerScope.setTag('outer', 'scope');
    expect(outerScope._tags).toEqual({ outer: 'scope' });
    let innerScope: Scope;
    client.withScope(scope => {
      innerScope = scope;
      scope.setTag('inner', 'scope');
    });
    expect(innerScope._tags).toEqual({ outer: 'scope', inner: 'scope' });
    expect(outerScope._tags).toEqual({ outer: 'scope' });
  });

  test('getScope within withScope returns current scope', () => {
    const outerScope = client.getScope();
    let innerScopeExplicit: Scope;
    let innerScopeFromClient: Scope;
    client.withScope(scope => {
      innerScopeExplicit = scope;
      innerScopeFromClient = client.getScope();
    });
    expect(innerScopeFromClient).toBe(innerScopeExplicit);
    expect(innerScopeFromClient).not.toBe(outerScope);
  });
});
