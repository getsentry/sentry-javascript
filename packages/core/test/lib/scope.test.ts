import { Scope } from '../../src/scope';

describe('Scope', () => {
  test('fingerprint', () => {
    const scope = new Scope();
    scope.setFingerprint(['abcd']);
    expect(scope.getFingerprint()).toEqual(['abcd']);
  });

  test('extra', () => {
    const scope = new Scope();
    scope.setExtra('a', 1);
    expect(scope.getExtra()).toEqual({ a: 1 });
  });

  test('tags', () => {
    const scope = new Scope();
    scope.setTag('a', 'b');
    expect(scope.getTags()).toEqual({ a: 'b' });
  });

  test('user', () => {
    const scope = new Scope();
    scope.setUser({ id: '1' });
    expect(scope.getUser()).toEqual({ id: '1' });
  });

  test('breadcrumbs', () => {
    const scope = new Scope();
    scope.addBreadcrumb({ message: 'test' }, 100);
    expect(scope.getBreadcrumbs()).toEqual([{ message: 'test' }]);
  });

  test('basic inheritance', () => {
    const parentScope = new Scope();
    parentScope.setExtra('a', 1);

    const scope = new Scope();
    scope.setParentScope(parentScope);
    expect(parentScope.getExtra()).toEqual(scope.getExtra());
  });

  test('parent changed inheritance', () => {
    const parentScope = new Scope();
    const scope = new Scope();
    scope.setParentScope(parentScope);
    parentScope.setExtra('a', 2);
    expect(scope.getExtra()).toEqual({});
    expect(parentScope.getExtra()).toEqual({ a: 2 });
  });

  test('child override inheritance', () => {
    const parentScope = new Scope();
    parentScope.setExtra('a', 1);

    const scope = new Scope();
    scope.setParentScope(parentScope);
    scope.setExtra('a', 2);
    expect(parentScope.getExtra()).toEqual({ a: 1 });
    expect(scope.getExtra()).toEqual({ a: 2 });
  });
});
