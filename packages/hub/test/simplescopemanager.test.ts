import { Scope } from '../src/scope';
import { SimpleScopeManager } from '../src/simpleScopeManager';

describe('SimpleScopeManager', () => {
  let scopeManager: SimpleScopeManager;

  beforeEach(() => {
    scopeManager = new SimpleScopeManager();
  });

  test('getScope returns mutable scope', () => {
    const scope = scopeManager.getCurrentScope();
    scope.setTag('key', 'value');
    // @ts-ignore: Access _tags
    expect(scope._tags).toEqual({ key: 'value' });
    expect(scopeManager.getCurrentScope()).toEqual(scope);
  });

  test('withScope returns return value from wrapped function', () => {
    const rv = scopeManager.withScope(() => 42);
    expect(rv).toEqual(42);
  });

  test('withScope forks the current scope', () => {
    const outerScope = scopeManager.getCurrentScope();
    outerScope.setTag('outer', 'scope');

    // @ts-ignore: tags
    expect(outerScope._tags).toEqual({ outer: 'scope' });
    let innerScope: Scope;
    scopeManager.withScope(scope => {
      innerScope = scope;
      scope.setTag('inner', 'scope');
    });

    // @ts-ignore: tags
    expect(innerScope._tags).toEqual({ outer: 'scope', inner: 'scope' });
    // @ts-ignore: tags
    expect(outerScope._tags).toEqual({ outer: 'scope' });
  });

  test('getScope within withScope returns current scope', () => {
    const outerScope = scopeManager.getCurrentScope();
    let innerScopeExplicit: Scope;
    let innerScopeFromClient: Scope;
    scopeManager.withScope(scope => {
      innerScopeExplicit = scope;
      innerScopeFromClient = scopeManager.getCurrentScope();
    });

    // @ts-ignore: TODO: Figure out
    expect(innerScopeFromClient).toBe(innerScopeExplicit);

    // @ts-ignore: TODO: Figure out
    expect(innerScopeFromClient).not.toBe(outerScope);
  });
});
