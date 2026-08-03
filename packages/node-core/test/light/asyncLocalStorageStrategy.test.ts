import { afterEach, describe, expect, it } from 'vitest';
import * as Sentry from '../../src/light';
import { cleanupLightSdk, mockLightSdkInit, resetGlobals } from '../helpers/mockLightSdkInit';

describe('Light Mode | AsyncLocalStorage Strategy', () => {
  afterEach(() => {
    cleanupLightSdk();
  });

  describe('scope isolation with setTimeout', () => {
    it('maintains scope across setTimeout', async () => {
      mockLightSdkInit();

      const result = await new Promise<string>(resolve => {
        Sentry.withScope(scope => {
          scope.setTag('asyncTag', 'asyncValue');

          setTimeout(() => {
            const tag = Sentry.getCurrentScope().getScopeData().tags?.asyncTag;
            resolve(tag as string);
          }, 10);
        });
      });

      expect(result).toBe('asyncValue');
    });

    it('isolates scopes across concurrent setTimeout calls', async () => {
      mockLightSdkInit();

      const results = await Promise.all([
        new Promise<string>(resolve => {
          Sentry.withScope(scope => {
            scope.setTag('id', 'first');
            setTimeout(() => {
              resolve(Sentry.getCurrentScope().getScopeData().tags?.id as string);
            }, 20);
          });
        }),
        new Promise<string>(resolve => {
          Sentry.withScope(scope => {
            scope.setTag('id', 'second');
            setTimeout(() => {
              resolve(Sentry.getCurrentScope().getScopeData().tags?.id as string);
            }, 10);
          });
        }),
      ]);

      expect(results).toEqual(['first', 'second']);
    });
  });

  describe('scope isolation with Promises', () => {
    it('maintains scope across Promise chains', async () => {
      mockLightSdkInit();

      const result = await Sentry.withScope(async scope => {
        scope.setTag('promiseTag', 'promiseValue');

        await Promise.resolve();

        return Sentry.getCurrentScope().getScopeData().tags?.promiseTag;
      });

      expect(result).toBe('promiseValue');
    });

    it('isolates scopes across concurrent Promise.all', async () => {
      mockLightSdkInit();

      const results = await Promise.all(
        [1, 2, 3].map(id =>
          Sentry.withScope(async scope => {
            scope.setTag('id', `value-${id}`);

            // Simulate async work
            await new Promise(resolve => setTimeout(resolve, Math.random() * 20));

            return Sentry.getCurrentScope().getScopeData().tags?.id;
          }),
        ),
      );

      expect(results).toEqual(['value-1', 'value-2', 'value-3']);
    });
  });

  describe('scope isolation with async/await', () => {
    it('maintains isolation scope across async/await', async () => {
      mockLightSdkInit();

      const result = await Sentry.withIsolationScope(async isolationScope => {
        isolationScope.setUser({ id: 'async-user' });

        await Promise.resolve();

        return Sentry.getIsolationScope().getScopeData().user?.id;
      });

      expect(result).toBe('async-user');
    });

    it('maintains both current and isolation scope across async boundaries', async () => {
      mockLightSdkInit();

      const result = await Sentry.withIsolationScope(async isolationScope => {
        isolationScope.setTag('isolationTag', 'isolationValue');

        return Sentry.withScope(async currentScope => {
          currentScope.setTag('currentTag', 'currentValue');

          await new Promise(resolve => setTimeout(resolve, 10));

          return {
            isolationTag: Sentry.getIsolationScope().getScopeData().tags?.isolationTag,
            currentTag: Sentry.getCurrentScope().getScopeData().tags?.currentTag,
          };
        });
      });

      expect(result).toEqual({
        isolationTag: 'isolationValue',
        currentTag: 'currentValue',
      });
    });
  });

  describe('suppressTracing', () => {
    it('sets suppression metadata on scope', () => {
      mockLightSdkInit();

      Sentry.suppressTracing(() => {
        const metadata = Sentry.getCurrentScope().getScopeData().sdkProcessingMetadata;
        expect(metadata?.__SENTRY_SUPPRESS_TRACING__).toBe(true);
      });
    });

    it('does not affect outer scope', () => {
      mockLightSdkInit();

      Sentry.suppressTracing(() => {
        // Inside suppressTracing
      });

      const metadata = Sentry.getCurrentScope().getScopeData().sdkProcessingMetadata;
      expect(metadata?.__SENTRY_SUPPRESS_TRACING__).toBeUndefined();
    });
  });

  describe('nested withScope and withIsolationScope', () => {
    it('correctly nests isolation and current scopes', async () => {
      mockLightSdkInit();

      const initialIsolationScope = Sentry.getIsolationScope();
      const initialCurrentScope = Sentry.getCurrentScope();

      await Sentry.withIsolationScope(async isolationScope1 => {
        expect(Sentry.getIsolationScope()).toBe(isolationScope1);
        expect(Sentry.getIsolationScope()).not.toBe(initialIsolationScope);
        // Current scope should also be forked
        expect(Sentry.getCurrentScope()).not.toBe(initialCurrentScope);

        isolationScope1.setTag('level', '1');

        await Sentry.withScope(async currentScope1 => {
          expect(Sentry.getCurrentScope()).toBe(currentScope1);
          currentScope1.setTag('current', '1');

          await Sentry.withIsolationScope(async isolationScope2 => {
            expect(Sentry.getIsolationScope()).toBe(isolationScope2);
            expect(Sentry.getIsolationScope()).not.toBe(isolationScope1);

            // Should inherit from parent isolation scope
            expect(isolationScope2.getScopeData().tags?.level).toBe('1');
            isolationScope2.setTag('level', '2');

            // Parent should be unchanged
            expect(isolationScope1.getScopeData().tags?.level).toBe('1');
          });

          // After exiting nested isolation scope, we should be back to original
          expect(Sentry.getIsolationScope()).toBe(isolationScope1);
        });
      });

      // After exiting all scopes, we should be back to initial
      expect(Sentry.getIsolationScope()).toBe(initialIsolationScope);
      expect(Sentry.getCurrentScope()).toBe(initialCurrentScope);
    });
  });

  describe('withIsolationScope trace handling', () => {
    it('gives each forked isolation scope its own trace id when not continuing an incoming trace', () => {
      mockLightSdkInit();

      const traceIds: string[] = [];

      Sentry.withIsolationScope(() => {
        traceIds.push(Sentry.getCurrentScope().getPropagationContext().traceId);
      });
      Sentry.withIsolationScope(() => {
        traceIds.push(Sentry.getCurrentScope().getPropagationContext().traceId);
      });

      expect(traceIds[0]).toMatch(/^[a-f0-9]{32}$/);
      expect(traceIds[1]).toMatch(/^[a-f0-9]{32}$/);
      expect(traceIds[0]).not.toBe(traceIds[1]);
    });

    it('keeps the trace id when continuing an incoming trace (parentSpanId set)', () => {
      mockLightSdkInit();

      const incomingTraceId = 'cafecafecafecafecafecafecafecafe';
      Sentry.getCurrentScope().setPropagationContext({
        traceId: incomingTraceId,
        parentSpanId: '1234567890abcdef',
        sampleRand: 0.42,
      });

      Sentry.withIsolationScope(() => {
        expect(Sentry.getCurrentScope().getPropagationContext().traceId).toBe(incomingTraceId);
      });
    });

    // A trace-id-only `sentry-trace` header yields a propagation context with a `dsc` but no
    // `parentSpanId`, because the span id is optional in the header. Such a trace is still being
    // continued, so its trace id must survive the fork.
    it('keeps the trace id when continuing an incoming trace without a span id (dsc set)', () => {
      mockLightSdkInit();

      const incomingTraceId = 'cafecafecafecafecafecafecafecafe';
      Sentry.getCurrentScope().setPropagationContext({
        traceId: incomingTraceId,
        sampleRand: 0.42,
        dsc: { trace_id: incomingTraceId, sample_rate: '1' },
      });

      Sentry.withIsolationScope(() => {
        const propagationContext = Sentry.getCurrentScope().getPropagationContext();

        expect(propagationContext.traceId).toBe(incomingTraceId);
        expect(propagationContext.dsc).toEqual({ trace_id: incomingTraceId, sample_rate: '1' });
      });
    });

    // A new trace must not inherit the previous trace's sampling decision or propagation span id.
    // Keeping them would apply the old trace's sampling decision to the new one and propagate a
    // span id belonging to a different trace.
    it('drops the previous trace data when giving a forked isolation scope its own trace', () => {
      mockLightSdkInit();

      const oldTraceId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      Sentry.getCurrentScope().setPropagationContext({
        traceId: oldTraceId,
        sampleRand: 0.1,
        sampled: true,
        propagationSpanId: 'bbbbbbbbbbbbbbbb',
      });

      Sentry.withIsolationScope(() => {
        const propagationContext = Sentry.getCurrentScope().getPropagationContext();

        expect(propagationContext.traceId).toMatch(/^[a-f0-9]{32}$/);
        expect(propagationContext.traceId).not.toBe(oldTraceId);
        expect(propagationContext.sampleRand).toEqual(expect.any(Number));
        expect(propagationContext.sampled).toBeUndefined();
        expect(propagationContext.propagationSpanId).toBeUndefined();
        expect(propagationContext.dsc).toBeUndefined();
      });
    });
  });

  describe('fallback behavior', () => {
    it('returns default scopes when AsyncLocalStorage store is empty', () => {
      resetGlobals();
      // Before init, should still return valid scopes
      const currentScope = Sentry.getCurrentScope();
      const isolationScope = Sentry.getIsolationScope();

      expect(currentScope).toBeDefined();
      expect(isolationScope).toBeDefined();

      // Should be able to set data on them
      currentScope.setTag('test', 'value');
      expect(currentScope.getScopeData().tags?.test).toBe('value');
    });
  });
});
