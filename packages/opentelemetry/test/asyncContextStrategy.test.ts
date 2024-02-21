import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import {
  getCurrentScope,
  getIsolationScope,
  setAsyncContextStrategy,
  withIsolationScope,
  withScope,
} from '@sentry/core';

import type { Scope } from '@sentry/types';
import { setOpenTelemetryContextAsyncContextStrategy } from '../src/asyncContextStrategy';
import { TestClient, getDefaultTestClientOptions } from './helpers/TestClient';
import { setupOtel } from './helpers/initOtel';
import { cleanupOtel } from './helpers/mockSdkInit';

describe('asyncContextStrategy', () => {
  let provider: BasicTracerProvider | undefined;

  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();

    const options = getDefaultTestClientOptions();
    const client = new TestClient(options);
    provider = setupOtel(client);
    setOpenTelemetryContextAsyncContextStrategy();
  });

  afterEach(() => {
    cleanupOtel(provider);
  });

  afterAll(() => {
    // clear the strategy
    setAsyncContextStrategy(undefined);
  });

  test('scope inheritance', () => {
    const initialScope = getCurrentScope();
    const initialIsolationScope = getIsolationScope();

    initialScope.setExtra('a', 'a');
    initialIsolationScope.setExtra('aa', 'aa');

    withIsolationScope(() => {
      const scope1 = getCurrentScope();
      const isolationScope1 = getIsolationScope();

      expect(scope1).not.toBe(initialScope);
      expect(isolationScope1).not.toBe(initialIsolationScope);

      expect(scope1.getScopeData()).toEqual(initialScope.getScopeData());
      expect(isolationScope1.getScopeData()).toEqual(initialIsolationScope.getScopeData());

      scope1.setExtra('b', 'b');
      isolationScope1.setExtra('bb', 'bb');

      withScope(() => {
        const scope2 = getCurrentScope();
        const isolationScope2 = getIsolationScope();

        expect(scope2).not.toBe(scope1);
        expect(isolationScope2).toBe(isolationScope1);

        expect(scope2.getScopeData()).toEqual(scope1.getScopeData());

        scope2.setExtra('c', 'c');

        expect(scope2.getScopeData().extra).toEqual({
          a: 'a',
          b: 'b',
          c: 'c',
        });

        expect(isolationScope2.getScopeData().extra).toEqual({
          aa: 'aa',
          bb: 'bb',
        });
      });
    });
  });

  test('async scope inheritance', async () => {
    const initialScope = getCurrentScope();
    const initialIsolationScope = getIsolationScope();

    async function asycnSetExtra(scope: Scope, key: string, value: string): Promise<void> {
      await new Promise(resolve => setTimeout(resolve, 1));
      scope.setExtra(key, value);
    }

    initialScope.setExtra('a', 'a');
    initialIsolationScope.setExtra('aa', 'aa');

    await withIsolationScope(async () => {
      const scope1 = getCurrentScope();
      const isolationScope1 = getIsolationScope();

      expect(scope1).not.toBe(initialScope);
      expect(isolationScope1).not.toBe(initialIsolationScope);

      expect(scope1.getScopeData()).toEqual(initialScope.getScopeData());
      expect(isolationScope1.getScopeData()).toEqual(initialIsolationScope.getScopeData());

      await asycnSetExtra(scope1, 'b', 'b');
      await asycnSetExtra(isolationScope1, 'bb', 'bb');

      await withScope(async () => {
        const scope2 = getCurrentScope();
        const isolationScope2 = getIsolationScope();

        expect(scope2).not.toBe(scope1);
        expect(isolationScope2).toBe(isolationScope1);

        expect(scope2.getScopeData()).toEqual(scope1.getScopeData());

        await asycnSetExtra(scope2, 'c', 'c');

        expect(scope2.getScopeData().extra).toEqual({
          a: 'a',
          b: 'b',
          c: 'c',
        });

        expect(isolationScope2.getScopeData().extra).toEqual({
          aa: 'aa',
          bb: 'bb',
        });
      });
    });
  });

  test('concurrent scope contexts', () => {
    const initialScope = getCurrentScope();
    const initialIsolationScope = getIsolationScope();

    initialScope.setExtra('a', 'a');
    initialIsolationScope.setExtra('aa', 'aa');

    withIsolationScope(() => {
      const scope1 = getCurrentScope();
      const isolationScope1 = getIsolationScope();

      expect(scope1).not.toBe(initialScope);
      expect(isolationScope1).not.toBe(initialIsolationScope);

      expect(scope1.getScopeData()).toEqual(initialScope.getScopeData());
      expect(isolationScope1.getScopeData()).toEqual(initialIsolationScope.getScopeData());

      scope1.setExtra('b', 'b');
      isolationScope1.setExtra('bb', 'bb');

      withScope(() => {
        const scope2 = getCurrentScope();
        const isolationScope2 = getIsolationScope();

        expect(scope2).not.toBe(scope1);
        expect(isolationScope2).toBe(isolationScope1);

        expect(scope2.getScopeData()).toEqual(scope1.getScopeData());

        scope2.setExtra('c', 'c');

        expect(scope2.getScopeData().extra).toEqual({
          a: 'a',
          b: 'b',
          c: 'c',
        });

        expect(isolationScope2.getScopeData().extra).toEqual({
          aa: 'aa',
          bb: 'bb',
        });
      });
    });

    withIsolationScope(() => {
      const scope1 = getCurrentScope();
      const isolationScope1 = getIsolationScope();

      expect(scope1).not.toBe(initialScope);
      expect(isolationScope1).not.toBe(initialIsolationScope);

      expect(scope1.getScopeData()).toEqual(initialScope.getScopeData());
      expect(isolationScope1.getScopeData()).toEqual(initialIsolationScope.getScopeData());

      scope1.setExtra('b2', 'b');
      isolationScope1.setExtra('bb2', 'bb');

      withScope(() => {
        const scope2 = getCurrentScope();
        const isolationScope2 = getIsolationScope();

        expect(scope2).not.toBe(scope1);
        expect(isolationScope2).toBe(isolationScope1);

        expect(scope2.getScopeData()).toEqual(scope1.getScopeData());

        scope2.setExtra('c2', 'c');

        expect(scope2.getScopeData().extra).toEqual({
          a: 'a',
          b2: 'b',
          c2: 'c',
        });

        expect(isolationScope2.getScopeData().extra).toEqual({
          aa: 'aa',
          bb2: 'bb',
        });
      });
    });
  });

  test('concurrent async scope contexts', async () => {
    const initialScope = getCurrentScope();
    const initialIsolationScope = getIsolationScope();

    async function asycnSetExtra(scope: Scope, key: string, value: string): Promise<void> {
      await new Promise(resolve => setTimeout(resolve, 1));
      scope.setExtra(key, value);
    }

    initialScope.setExtra('a', 'a');
    initialIsolationScope.setExtra('aa', 'aa');

    await withIsolationScope(async () => {
      const scope1 = getCurrentScope();
      const isolationScope1 = getIsolationScope();

      expect(scope1).not.toBe(initialScope);
      expect(isolationScope1).not.toBe(initialIsolationScope);

      expect(scope1.getScopeData()).toEqual(initialScope.getScopeData());
      expect(isolationScope1.getScopeData()).toEqual(initialIsolationScope.getScopeData());

      await asycnSetExtra(scope1, 'b', 'b');
      await asycnSetExtra(isolationScope1, 'bb', 'bb');

      await withScope(async () => {
        const scope2 = getCurrentScope();
        const isolationScope2 = getIsolationScope();

        expect(scope2).not.toBe(scope1);
        expect(isolationScope2).toBe(isolationScope1);

        expect(scope2.getScopeData()).toEqual(scope1.getScopeData());

        await asycnSetExtra(scope2, 'c', 'c');

        expect(scope2.getScopeData().extra).toEqual({
          a: 'a',
          b: 'b',
          c: 'c',
        });

        expect(isolationScope2.getScopeData().extra).toEqual({
          aa: 'aa',
          bb: 'bb',
        });
      });
    });

    await withIsolationScope(async () => {
      const scope1 = getCurrentScope();
      const isolationScope1 = getIsolationScope();

      expect(scope1).not.toBe(initialScope);
      expect(isolationScope1).not.toBe(initialIsolationScope);

      expect(scope1.getScopeData()).toEqual(initialScope.getScopeData());
      expect(isolationScope1.getScopeData()).toEqual(initialIsolationScope.getScopeData());

      scope1.setExtra('b2', 'b');
      isolationScope1.setExtra('bb2', 'bb');

      await withScope(async () => {
        const scope2 = getCurrentScope();
        const isolationScope2 = getIsolationScope();

        expect(scope2).not.toBe(scope1);
        expect(isolationScope2).toBe(isolationScope1);

        expect(scope2.getScopeData()).toEqual(scope1.getScopeData());

        scope2.setExtra('c2', 'c');

        expect(scope2.getScopeData().extra).toEqual({
          a: 'a',
          b2: 'b',
          c2: 'c',
        });

        expect(isolationScope2.getScopeData().extra).toEqual({
          aa: 'aa',
          bb2: 'bb',
        });
      });
    });
  });
});
