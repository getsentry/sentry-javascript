import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '../../src/light';
import { cleanupLightSdk, mockLightSdkInit, resetGlobals } from '../helpers/mockLightSdkInit';

describe('Light Mode | Scope', () => {
  afterEach(() => {
    cleanupLightSdk();
  });

  describe('basic error capturing', () => {
    it('captures exceptions with correct tags', async () => {
      const beforeSend = vi.fn(() => null);
      const client = mockLightSdkInit({ beforeSend });

      const error = new Error('test error');

      Sentry.getCurrentScope().setTag('tag1', 'val1');
      Sentry.captureException(error);

      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            tag1: 'val1',
          },
        }),
        expect.objectContaining({
          originalException: error,
        }),
      );
    });
  });

  describe('withScope', () => {
    it('isolates scope data within withScope callback', async () => {
      const beforeSend = vi.fn(() => null);
      const client = mockLightSdkInit({ beforeSend });

      const error = new Error('test error');

      Sentry.getCurrentScope().setTag('tag1', 'val1');

      Sentry.withScope(scope => {
        scope.setTag('tag2', 'val2');
        Sentry.captureException(error);
      });

      // Tag2 should not leak outside withScope
      expect(Sentry.getCurrentScope().getScopeData().tags).toEqual({ tag1: 'val1' });

      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            tag1: 'val1',
            tag2: 'val2',
          },
        }),
        expect.objectContaining({
          originalException: error,
        }),
      );
    });

    it('can be deeply nested', async () => {
      const beforeSend = vi.fn(() => null);
      const client = mockLightSdkInit({ beforeSend });

      const error = new Error('test error');

      Sentry.getCurrentScope().setTag('tag1', 'val1');

      Sentry.withScope(scope1 => {
        scope1.setTag('tag2', 'val2');

        Sentry.withScope(scope2 => {
          scope2.setTag('tag3', 'val3');

          Sentry.withScope(scope3 => {
            scope3.setTag('tag4', 'val4');
          });

          Sentry.captureException(error);
        });
      });

      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            tag1: 'val1',
            tag2: 'val2',
            tag3: 'val3',
          },
        }),
        expect.objectContaining({
          originalException: error,
        }),
      );
    });
  });

  describe('withIsolationScope', () => {
    beforeEach(() => {
      resetGlobals();
    });

    it('isolates isolation scope data', async () => {
      const beforeSend = vi.fn(() => null);
      const client = mockLightSdkInit({ beforeSend });

      const initialIsolationScope = Sentry.getIsolationScope();
      initialIsolationScope.setTag('tag1', 'val1');

      const error = new Error('test error');

      Sentry.withIsolationScope(newIsolationScope => {
        expect(Sentry.getIsolationScope()).toBe(newIsolationScope);
        expect(newIsolationScope).not.toBe(initialIsolationScope);

        // Data is forked off original isolation scope
        expect(newIsolationScope.getScopeData().tags).toEqual({ tag1: 'val1' });
        newIsolationScope.setTag('tag2', 'val2');

        Sentry.captureException(error);
      });

      // Tag2 should not leak to original isolation scope
      expect(initialIsolationScope.getScopeData().tags).toEqual({ tag1: 'val1' });

      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            tag1: 'val1',
            tag2: 'val2',
          },
        }),
        expect.objectContaining({
          originalException: error,
        }),
      );
    });

    it('can be deeply nested', async () => {
      const beforeSend = vi.fn(() => null);
      const client = mockLightSdkInit({ beforeSend });

      const initialIsolationScope = Sentry.getIsolationScope();
      initialIsolationScope.setTag('tag1', 'val1');

      const error = new Error('test error');

      Sentry.withIsolationScope(scope1 => {
        scope1.setTag('tag2', 'val2');

        Sentry.withIsolationScope(scope2 => {
          scope2.setTag('tag3', 'val3');

          Sentry.withIsolationScope(scope3 => {
            scope3.setTag('tag4', 'val4');
          });

          Sentry.captureException(error);
        });
      });

      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            tag1: 'val1',
            tag2: 'val2',
            tag3: 'val3',
          },
        }),
        expect.objectContaining({
          originalException: error,
        }),
      );
    });
  });

  describe('concurrent async operations', () => {
    it('maintains scope isolation across concurrent async operations', async () => {
      const beforeSend = vi.fn(() => null);
      const client = mockLightSdkInit({ beforeSend });

      // Simulate concurrent requests
      const promises = [1, 2, 3].map(async id => {
        return Sentry.withIsolationScope(async isolationScope => {
          isolationScope.setTag('requestId', `request-${id}`);
          isolationScope.setUser({ id: `user-${id}` });

          // Simulate async work with different delays
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));

          Sentry.captureException(new Error(`Error for request ${id}`));

          // Verify scope is still correct after async work
          expect(Sentry.getIsolationScope().getScopeData().tags?.requestId).toBe(`request-${id}`);
          expect(Sentry.getIsolationScope().getScopeData().user?.id).toBe(`user-${id}`);
        });
      });

      await Promise.all(promises);
      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(3);

      // Each error should have its own isolated context - check by matching error message to tags
      for (let id = 1; id <= 3; id++) {
        expect(beforeSend).toHaveBeenCalledWith(
          expect.objectContaining({
            exception: expect.objectContaining({
              values: expect.arrayContaining([
                expect.objectContaining({
                  value: `Error for request ${id}`,
                }),
              ]),
            }),
            tags: expect.objectContaining({
              requestId: `request-${id}`,
            }),
            user: expect.objectContaining({
              id: `user-${id}`,
            }),
          }),
          expect.any(Object),
        );
      }
    });
  });

  describe('global scope', () => {
    beforeEach(() => {
      resetGlobals();
    });

    it('works before calling init', () => {
      const globalScope = Sentry.getGlobalScope();
      expect(globalScope).toBeDefined();

      globalScope.setTag('tag1', 'val1');
      expect(globalScope.getScopeData().tags).toEqual({ tag1: 'val1' });

      // Now when we call init, the global scope remains intact
      // Note: We call init directly here instead of mockLightSdkInit because
      // mockLightSdkInit calls resetGlobals() which would clear the tags we just set
      Sentry.init({ dsn: 'https://username@domain/123', defaultIntegrations: false });

      expect(Sentry.getGlobalScope()).toBe(globalScope);
      expect(globalScope.getScopeData().tags).toEqual({ tag1: 'val1' });
    });

    it('is applied to events', async () => {
      const beforeSend = vi.fn(() => null);
      const client = mockLightSdkInit({ beforeSend });

      const globalScope = Sentry.getGlobalScope();
      globalScope.setTag('globalTag', 'globalValue');

      const error = new Error('test error');
      Sentry.captureException(error);

      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.objectContaining({
            globalTag: 'globalValue',
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('scope merging', () => {
    beforeEach(() => {
      resetGlobals();
    });

    it('merges data from global, isolation and current scope', async () => {
      const beforeSend = vi.fn(() => null);
      const client = mockLightSdkInit({ beforeSend });

      Sentry.getGlobalScope().setTag('globalTag', 'globalValue');

      const error = new Error('test error');

      Sentry.withIsolationScope(isolationScope => {
        isolationScope.setTag('isolationTag', 'isolationValue');

        Sentry.withScope(currentScope => {
          currentScope.setTag('currentTag', 'currentValue');

          Sentry.captureException(error);
        });
      });

      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            globalTag: 'globalValue',
            isolationTag: 'isolationValue',
            currentTag: 'currentValue',
          },
        }),
        expect.objectContaining({
          originalException: error,
        }),
      );
    });

    it('current scope overrides isolation scope', async () => {
      const beforeSend = vi.fn(() => null);
      const client = mockLightSdkInit({ beforeSend });

      const error = new Error('test error');

      Sentry.withIsolationScope(isolationScope => {
        isolationScope.setTag('tag', 'isolationValue');

        Sentry.withScope(currentScope => {
          currentScope.setTag('tag', 'currentValue');
          Sentry.captureException(error);
        });
      });

      await client?.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            tag: 'currentValue',
          },
        }),
        expect.any(Object),
      );
    });
  });
});
