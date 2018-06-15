import { SentryEvent } from '@sentry/types';
import { Scope } from '../../src';

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

  test('listeners', () => {
    jest.useFakeTimers();
    const scope = new Scope();
    const listener = jest.fn();
    scope.addScopeListener(listener);
    scope.setExtra('a', 2);
    jest.runAllTimers();
    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls[0][0].extra).toEqual({ a: 2 });
  });

  test('applyToEvent', () => {
    const scope = new Scope();
    scope.setExtra('a', 2);
    scope.setTag('a', 'b');
    scope.setUser({ id: '1' });
    scope.setFingerprint(['abcd']);
    scope.addBreadcrumb({ message: 'test' }, 100);
    const event: SentryEvent = {};
    scope.applyToEvent(event);
    expect(event.extra).toEqual({ a: 2 });
    expect(event.tags).toEqual({ a: 'b' });
    expect(event.user).toEqual({ id: '1' });
    expect(event.fingerprint).toEqual(['abcd']);
    expect(event.breadcrumbs).toEqual([{ message: 'test' }]);
  });

  test('applyToEvent merge', () => {
    const scope = new Scope();
    scope.setExtra('a', 2);
    scope.setTag('a', 'b');
    scope.setUser({ id: '1' });
    scope.setFingerprint(['abcd']);
    scope.addBreadcrumb({ message: 'test' }, 100);
    const event: SentryEvent = {
      breadcrumbs: [{ message: 'test2' }],
      extra: { b: 3 },
      fingerprint: ['efgh'],
      tags: { b: 'c' },
      user: { id: '3' },
    };
    scope.applyToEvent(event);
    expect(event.extra).toEqual({ a: 2, b: 3 });
    expect(event.tags).toEqual({ a: 'b', b: 'c' });
    expect(event.user).toEqual({ id: '3' });
    expect(event.fingerprint).toEqual(['efgh']);
    expect(event.breadcrumbs).toEqual([{ message: 'test2' }]);
  });

  test('clear', () => {
    const scope = new Scope();
    scope.setExtra('a', 2);
    scope.setTag('a', 'b');
    scope.setUser({ id: '1' });
    scope.setFingerprint(['abcd']);
    scope.addBreadcrumb({ message: 'test' }, 100);
    expect(scope.getExtra()).toEqual({ a: 2 });
    scope.clear();
    expect(scope.getExtra()).toEqual({});
  });
});
