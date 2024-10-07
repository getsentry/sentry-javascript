import { Scope, getCurrentScope, getGlobalScope, getIsolationScope, withIsolationScope, withScope } from '@sentry/core';
import { setOpenTelemetryContextAsyncContextStrategy } from '@sentry/opentelemetry';
import { GLOBAL_OBJ } from '@sentry/utils';
import { AsyncLocalStorage } from 'async_hooks';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { VercelEdgeClient } from '../src';
import { setupOtel } from '../src/sdk';
import { makeEdgeTransport } from '../src/transports';

beforeAll(() => {
  (GLOBAL_OBJ as any).AsyncLocalStorage = AsyncLocalStorage;

  const client = new VercelEdgeClient({
    stackParser: () => [],
    integrations: [],
    transport: makeEdgeTransport,
  });

  setupOtel(client);

  setOpenTelemetryContextAsyncContextStrategy();
});

beforeEach(() => {
  getIsolationScope().clear();
  getCurrentScope().clear();
  getGlobalScope().clear();
});

describe('withScope()', () => {
  it('will make the passed scope the active scope within the callback', () =>
    new Promise<void>(done => {
      withScope(scope => {
        expect(getCurrentScope()).toBe(scope);
        done();
      });
    }));

  it('will pass a scope that is different from the current active isolation scope', () =>
    new Promise<void>(done => {
      withScope(scope => {
        expect(getIsolationScope()).not.toBe(scope);
        done();
      });
    }));

  it('will always make the inner most passed scope the current scope when nesting calls', () =>
    new Promise<void>(done => {
      withIsolationScope(_scope1 => {
        withIsolationScope(scope2 => {
          expect(getIsolationScope()).toBe(scope2);
          done();
        });
      });
    }));

  it('forks the scope when not passing any scope', () =>
    new Promise<void>(done => {
      const initialScope = getCurrentScope();
      initialScope.setTag('aa', 'aa');

      withScope(scope => {
        expect(getCurrentScope()).toBe(scope);
        scope.setTag('bb', 'bb');
        expect(scope).not.toBe(initialScope);
        expect(scope.getScopeData().tags).toEqual({ aa: 'aa', bb: 'bb' });
        done();
      });
    }));

  it('forks the scope when passing undefined', () =>
    new Promise<void>(done => {
      const initialScope = getCurrentScope();
      initialScope.setTag('aa', 'aa');

      withScope(undefined, scope => {
        expect(getCurrentScope()).toBe(scope);
        scope.setTag('bb', 'bb');
        expect(scope).not.toBe(initialScope);
        expect(scope.getScopeData().tags).toEqual({ aa: 'aa', bb: 'bb' });
        done();
      });
    }));

  it('sets the passed in scope as active scope', () =>
    new Promise<void>(done => {
      const initialScope = getCurrentScope();
      initialScope.setTag('aa', 'aa');

      const customScope = new Scope();

      withScope(customScope, scope => {
        expect(getCurrentScope()).toBe(customScope);
        expect(scope).toBe(customScope);
        done();
      });
    }));
});

describe('withIsolationScope()', () => {
  it('will make the passed isolation scope the active isolation scope within the callback', () =>
    new Promise<void>(done => {
      withIsolationScope(scope => {
        expect(getIsolationScope()).toBe(scope);
        done();
      });
    }));

  it('will pass an isolation scope that is different from the current active scope', () =>
    new Promise<void>(done => {
      withIsolationScope(scope => {
        expect(getCurrentScope()).not.toBe(scope);
        done();
      });
    }));

  it('will always make the inner most passed scope the current scope when nesting calls', () =>
    new Promise<void>(done => {
      withIsolationScope(_scope1 => {
        withIsolationScope(scope2 => {
          expect(getIsolationScope()).toBe(scope2);
          done();
        });
      });
    }));

  it('forks the isolation scope when not passing any isolation scope', () =>
    new Promise<void>(done => {
      const initialScope = getIsolationScope();
      initialScope.setTag('aa', 'aa');

      withIsolationScope(scope => {
        expect(getIsolationScope()).toBe(scope);
        scope.setTag('bb', 'bb');
        expect(scope).not.toBe(initialScope);
        expect(scope.getScopeData().tags).toEqual({ aa: 'aa', bb: 'bb' });
        done();
      });
    }));

  it('forks the isolation scope when passing undefined', () =>
    new Promise<void>(done => {
      const initialScope = getIsolationScope();
      initialScope.setTag('aa', 'aa');

      withIsolationScope(undefined, scope => {
        expect(getIsolationScope()).toBe(scope);
        scope.setTag('bb', 'bb');
        expect(scope).not.toBe(initialScope);
        expect(scope.getScopeData().tags).toEqual({ aa: 'aa', bb: 'bb' });
        done();
      });
    }));

  it('sets the passed in isolation scope as active isolation scope', () =>
    new Promise<void>(done => {
      const initialScope = getIsolationScope();
      initialScope.setTag('aa', 'aa');

      const customScope = new Scope();

      withIsolationScope(customScope, scope => {
        expect(getIsolationScope()).toBe(customScope);
        expect(scope).toBe(customScope);
        done();
      });
    }));
});
