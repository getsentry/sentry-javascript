import { Scope, getCurrentScope, getGlobalScope, getIsolationScope, withIsolationScope, withScope } from '@sentry/core';
import { GLOBAL_OBJ } from '@sentry/utils';
import { AsyncLocalStorage } from 'async_hooks';
import { setAsyncLocalStorageAsyncContextStrategy } from '../src/async';

describe('withScope()', () => {
  beforeEach(() => {
    getIsolationScope().clear();
    getCurrentScope().clear();
    getGlobalScope().clear();

    (GLOBAL_OBJ as any).AsyncLocalStorage = AsyncLocalStorage;
    setAsyncLocalStorageAsyncContextStrategy();
  });

  it('will make the passed scope the active scope within the callback', done => {
    withScope(scope => {
      expect(getCurrentScope()).toBe(scope);
      done();
    });
  });

  it('will pass a scope that is different from the current active isolation scope', done => {
    withScope(scope => {
      expect(getIsolationScope()).not.toBe(scope);
      done();
    });
  });

  it('will always make the inner most passed scope the current scope when nesting calls', done => {
    withIsolationScope(_scope1 => {
      withIsolationScope(scope2 => {
        expect(getIsolationScope()).toBe(scope2);
        done();
      });
    });
  });

  it('forks the scope when not passing any scope', done => {
    const initialScope = getCurrentScope();
    initialScope.setTag('aa', 'aa');

    withScope(scope => {
      expect(getCurrentScope()).toBe(scope);
      scope.setTag('bb', 'bb');
      expect(scope).not.toBe(initialScope);
      expect(scope.getScopeData().tags).toEqual({ aa: 'aa', bb: 'bb' });
      done();
    });
  });

  it('forks the scope when passing undefined', done => {
    const initialScope = getCurrentScope();
    initialScope.setTag('aa', 'aa');

    withScope(undefined, scope => {
      expect(getCurrentScope()).toBe(scope);
      scope.setTag('bb', 'bb');
      expect(scope).not.toBe(initialScope);
      expect(scope.getScopeData().tags).toEqual({ aa: 'aa', bb: 'bb' });
      done();
    });
  });

  it('sets the passed in scope as active scope', done => {
    const initialScope = getCurrentScope();
    initialScope.setTag('aa', 'aa');

    const customScope = new Scope();

    withScope(customScope, scope => {
      expect(getCurrentScope()).toBe(customScope);
      expect(scope).toBe(customScope);
      done();
    });
  });
});

describe('withIsolationScope()', () => {
  beforeEach(() => {
    getIsolationScope().clear();
    getCurrentScope().clear();
    getGlobalScope().clear();
    (GLOBAL_OBJ as any).AsyncLocalStorage = AsyncLocalStorage;

    setAsyncLocalStorageAsyncContextStrategy();
  });

  it('will make the passed isolation scope the active isolation scope within the callback', done => {
    withIsolationScope(scope => {
      expect(getIsolationScope()).toBe(scope);
      done();
    });
  });

  it('will pass an isolation scope that is different from the current active scope', done => {
    withIsolationScope(scope => {
      expect(getCurrentScope()).not.toBe(scope);
      done();
    });
  });

  it('will always make the inner most passed scope the current scope when nesting calls', done => {
    withIsolationScope(_scope1 => {
      withIsolationScope(scope2 => {
        expect(getIsolationScope()).toBe(scope2);
        done();
      });
    });
  });

  it('forks the isolation scope when not passing any isolation scope', done => {
    const initialScope = getIsolationScope();
    initialScope.setTag('aa', 'aa');

    withIsolationScope(scope => {
      expect(getIsolationScope()).toBe(scope);
      scope.setTag('bb', 'bb');
      expect(scope).not.toBe(initialScope);
      expect(scope.getScopeData().tags).toEqual({ aa: 'aa', bb: 'bb' });
      done();
    });
  });

  it('forks the isolation scope when passing undefined', done => {
    const initialScope = getIsolationScope();
    initialScope.setTag('aa', 'aa');

    withIsolationScope(undefined, scope => {
      expect(getIsolationScope()).toBe(scope);
      scope.setTag('bb', 'bb');
      expect(scope).not.toBe(initialScope);
      expect(scope.getScopeData().tags).toEqual({ aa: 'aa', bb: 'bb' });
      done();
    });
  });

  it('sets the passed in isolation scope as active isolation scope', done => {
    const initialScope = getIsolationScope();
    initialScope.setTag('aa', 'aa');

    const customScope = new Scope();

    withIsolationScope(customScope, scope => {
      expect(getIsolationScope()).toBe(customScope);
      expect(scope).toBe(customScope);
      done();
    });
  });
});
