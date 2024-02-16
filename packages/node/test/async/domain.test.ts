/* eslint-disable deprecation/deprecation */
import { Hub, getCurrentHub, getCurrentScope, makeMain, setAsyncContextStrategy, withScope } from '@sentry/core';
import { getIsolationScope, withIsolationScope } from '@sentry/core';
import type { Scope } from '@sentry/types';

import { setDomainAsyncContextStrategy } from '../../src/async/domain';

describe('setDomainAsyncContextStrategy()', () => {
  beforeEach(() => {
    const hub = new Hub();

    makeMain(hub);
  });

  afterEach(() => {
    // clear the strategy
    setAsyncContextStrategy(undefined);
  });

  describe('with withIsolationScope()', () => {
    it('forks the isolation scope (creating a new one)', done => {
      expect.assertions(7);
      setDomainAsyncContextStrategy();

      const topLevelIsolationScope = getIsolationScope();
      topLevelIsolationScope.setTag('val1', true);

      withIsolationScope(isolationScope1 => {
        expect(isolationScope1).not.toBe(topLevelIsolationScope);
        expect(isolationScope1.getScopeData().tags['val1']).toBe(true);
        isolationScope1.setTag('val2', true);
        topLevelIsolationScope.setTag('val3', true);

        withIsolationScope(isolationScope2 => {
          expect(isolationScope2).not.toBe(isolationScope1);
          expect(isolationScope2).not.toBe(topLevelIsolationScope);
          expect(isolationScope2.getScopeData().tags['val1']).toBe(true);
          expect(isolationScope2.getScopeData().tags['val2']).toBe(true);
          expect(isolationScope2.getScopeData().tags['val3']).toBeUndefined();

          done();
        });
      });
    });

    it('correctly keeps track of isolation scope across asynchronous operations', done => {
      expect.assertions(7);
      setDomainAsyncContextStrategy();

      const topLevelIsolationScope = getIsolationScope();
      expect(getIsolationScope()).toBe(topLevelIsolationScope);

      withIsolationScope(isolationScope1 => {
        setTimeout(() => {
          expect(getIsolationScope()).toBe(isolationScope1);

          withIsolationScope(isolationScope2 => {
            setTimeout(() => {
              expect(getIsolationScope()).toBe(isolationScope2);
            }, 100);
          });

          setTimeout(() => {
            expect(getIsolationScope()).toBe(isolationScope1);
            done();
          }, 200);

          expect(getIsolationScope()).toBe(isolationScope1);
        }, 100);
      });

      setTimeout(() => {
        expect(getIsolationScope()).toBe(topLevelIsolationScope);
      }, 200);

      expect(getIsolationScope()).toBe(topLevelIsolationScope);
    });
  });

  describe('with withScope()', () => {
    test('hub scope inheritance', () => {
      setDomainAsyncContextStrategy();

      const globalHub = getCurrentHub();
      const initialIsolationScope = getIsolationScope();
      const initialScope = getCurrentScope();

      initialScope.setExtra('a', 'b');

      withScope(scope => {
        const hub1 = getCurrentHub();
        expect(hub1).not.toBe(globalHub);
        expect(hub1).toEqual(globalHub);

        expect(hub1.getScope()).toBe(scope);
        expect(getCurrentScope()).toBe(scope);
        expect(scope).not.toBe(initialScope);

        scope.setExtra('c', 'd');

        expect(hub1.getIsolationScope()).toBe(initialIsolationScope);
        expect(getIsolationScope()).toBe(initialIsolationScope);

        withScope(scope2 => {
          const hub2 = getCurrentHub();
          expect(hub2).not.toBe(hub1);
          expect(hub2).toEqual(hub1);
          expect(hub2).not.toEqual(globalHub);

          expect(scope2).toEqual(scope);
          expect(scope2).not.toBe(scope);

          scope.setExtra('e', 'f');
          expect(scope2).not.toEqual(scope);
        });
      });
    });

    test('async hub scope inheritance', async () => {
      setDomainAsyncContextStrategy();

      async function addRandomExtra(scope: Scope, key: string): Promise<void> {
        return new Promise(resolve => {
          setTimeout(() => {
            scope.setExtra(key, Math.random());
            resolve();
          }, 100);
        });
      }

      const globalHub = getCurrentHub();
      const initialIsolationScope = getIsolationScope();
      const initialScope = getCurrentScope();

      await addRandomExtra(initialScope, 'a');

      await withScope(async scope => {
        const hub1 = getCurrentHub();
        expect(hub1).not.toBe(globalHub);
        expect(hub1).toEqual(globalHub);

        expect(hub1.getScope()).toBe(scope);
        expect(getCurrentScope()).toBe(scope);
        expect(scope).not.toBe(initialScope);

        await addRandomExtra(scope, 'b');

        expect(hub1.getIsolationScope()).toBe(initialIsolationScope);
        expect(getIsolationScope()).toBe(initialIsolationScope);

        await withScope(async scope2 => {
          const hub2 = getCurrentHub();
          expect(hub2).not.toBe(hub1);
          expect(hub2).toEqual(hub1);
          expect(hub2).not.toEqual(globalHub);

          expect(scope2).toEqual(scope);
          expect(scope2).not.toBe(scope);

          await addRandomExtra(scope2, 'c');
          expect(scope2).not.toEqual(scope);
        });
      });
    });

    test('context single instance', () => {
      setDomainAsyncContextStrategy();

      const globalHub = getCurrentHub();
      withScope(() => {
        expect(globalHub).not.toBe(getCurrentHub());
      });
    });

    test('context within a context not reused', () => {
      setDomainAsyncContextStrategy();

      withScope(() => {
        const hub1 = getCurrentHub();
        withScope(() => {
          const hub2 = getCurrentHub();
          expect(hub1).not.toBe(hub2);
        });
      });
    });

    test('concurrent hub contexts', done => {
      setDomainAsyncContextStrategy();

      let d1done = false;
      let d2done = false;

      withScope(() => {
        const hub = getCurrentHub() as Hub;

        hub.getStack().push({ client: 'process' } as any);

        expect(hub.getStack()[1]).toEqual({ client: 'process' });
        // Just in case so we don't have to worry which one finishes first
        // (although it always should be d2)
        setTimeout(() => {
          d1done = true;
          if (d2done) {
            done();
          }
        }, 0);
      });

      withScope(() => {
        const hub = getCurrentHub() as Hub;

        hub.getStack().push({ client: 'local' } as any);

        expect(hub.getStack()[1]).toEqual({ client: 'local' });
        setTimeout(() => {
          d2done = true;
          if (d1done) {
            done();
          }
        }, 0);
      });
    });
  });
});
