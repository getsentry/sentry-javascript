import { setImmediate } from 'node:timers/promises';
import { context, createContextKey, trace, TraceFlags } from '@opentelemetry/api';
import {
  getActiveSpan,
  getCurrentScope,
  getIsolationScope,
  getMainCarrier,
  Scope,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import { setOpenTelemetryContextAsyncContextStrategy } from '@sentry/opentelemetry';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const span = trace.wrapSpanContext({
  traceId: '12345678901234567890123456789012',
  spanId: '1234567890123456',
  traceFlags: TraceFlags.SAMPLED,
});

describe('live async context strategy switching', () => {
  beforeEach(() => {
    context.disable();
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    context.disable();
    getMainCarrier().__SENTRY__ = undefined;
  });

  describe.each([
    { observation: 'without a context read', observe: () => undefined },
    { observation: 'after a context read', observe: () => context.active() },
  ])('$observation', ({ observe }) => {
    it.each([
      { name: 'forked isolation', enter: (callback: (scope: Scope) => Promise<void>) => withIsolationScope(callback) },
      {
        name: 'explicit isolation',
        enter: (callback: (scope: Scope) => Promise<void>) => withIsolationScope(new Scope(), callback),
      },
      {
        name: 'nested current scope',
        enter: (callback: (scope: Scope) => Promise<void>) =>
          withIsolationScope(isolation => withScope(() => callback(isolation))),
      },
      {
        name: 'explicitly reused current scope',
        enter: (callback: (scope: Scope) => Promise<void>) =>
          withIsolationScope(isolation => withScope(getCurrentScope(), () => callback(isolation))),
      },
    ])('keeps $name when rebinding the newly created current scope', async ({ enter }) => {
      expect.assertions(8);
      setOpenTelemetryContextAsyncContextStrategy();
      const key = createContextKey('live-request');
      const request = trace.setSpan(context.active().setValue(key, 'request-a'), span);

      await context.with(request, async () => {
        const parentScope = getCurrentScope();
        const parentIsolation = getIsolationScope();
        setAsyncLocalStorageAsyncContextStrategy();

        await enter(async isolation => {
          const current = getCurrentScope();
          observe();
          setOpenTelemetryContextAsyncContextStrategy();
          expect(getActiveSpan(current)).toBe(span);

          await withScope(current, async supplied => {
            await setImmediate();
            expect(supplied).toBe(current);
            expect(getCurrentScope()).toBe(current);
            expect(getIsolationScope()).toBe(isolation);
            expect(getActiveSpan()).toBe(span);
            expect(context.active().getValue(key)).toBe('request-a');
          });
        });

        expect(getCurrentScope()).toBe(parentScope);
        expect(getIsolationScope()).toBe(parentIsolation);
      });
    });

    it.each([
      {
        name: 'original',
        capture: (scope: Scope) => scope,
        enter: (scope: Scope, callback: (scope: Scope) => Promise<void>) => withScope(scope, callback),
      },
      {
        name: 'deliberate clone',
        capture: (scope: Scope) => scope.clone(),
        enter: (scope: Scope, callback: (scope: Scope) => Promise<void>) => withScope(scope, callback),
      },
      {
        name: 'child of a borrowed scope',
        capture: (scope: Scope) => scope,
        enter: (scope: Scope, callback: (scope: Scope) => Promise<void>) => withScope(scope, () => withScope(callback)),
      },
      {
        name: 'isolation child of a borrowed scope',
        capture: (scope: Scope) => scope,
        enter: (scope: Scope, callback: (scope: Scope) => Promise<void>) =>
          withScope(scope, () => withIsolationScope(() => callback(getCurrentScope()))),
      },
    ])('restores a captured $name while it is still borrowed by plain context', async ({ capture, enter }) => {
      expect.assertions(8);
      setOpenTelemetryContextAsyncContextStrategy();
      const key = createContextKey('captured-owner');
      const request = trace.setSpan(context.active().setValue(key, 'source'), span);
      const captured = context.with(request, () =>
        withIsolationScope(isolation => ({ scope: capture(getCurrentScope()), isolation })),
      );

      await context.with(context.active().setValue(key, 'caller'), async () => {
        const callerScope = getCurrentScope();
        const callerIsolation = getIsolationScope();
        setAsyncLocalStorageAsyncContextStrategy();

        await enter(captured.scope, async current => {
          observe();
          setOpenTelemetryContextAsyncContextStrategy();
          expect(getActiveSpan(current)).toBe(span);
          await withScope(current, async supplied => {
            await setImmediate();
            expect(supplied).toBe(current);
            expect(getCurrentScope()).toBe(current);
            expect(getIsolationScope()).toBe(captured.isolation);
            expect(getActiveSpan()).toBe(span);
            expect(context.active().getValue(key)).toBe('source');
          });
        });

        expect(getCurrentScope()).toBe(callerScope);
        expect(getIsolationScope()).toBe(callerIsolation);
      });
    });
  });

  it('preserves an escaped plain child of a captured scope across setup at root', async () => {
    expect.assertions(4);
    setOpenTelemetryContextAsyncContextStrategy();
    const key = createContextKey('escaped-owner');
    const request = trace.setSpan(context.active().setValue(key, 'source'), span);
    const captured = context.with(request, () =>
      withIsolationScope(isolation => ({ scope: getCurrentScope(), isolation })),
    );
    setAsyncLocalStorageAsyncContextStrategy();
    const child = withScope(captured.scope, () => withScope(scope => scope));
    setOpenTelemetryContextAsyncContextStrategy();

    expect(getActiveSpan(child)).toBe(span);
    await withScope(child, async scope => {
      await setImmediate();
      expect(scope).toBe(child);
      expect(getIsolationScope()).toBe(captured.isolation);
      expect(context.active().getValue(key)).toBe('source');
    });
  });

  it('preserves a captured context inherited from the default scope', async () => {
    expect.assertions(4);
    const rootScope = getCurrentScope();
    setOpenTelemetryContextAsyncContextStrategy();
    const key = createContextKey('default-owner');
    const request = trace.setSpan(context.active().setValue(key, 'source'), span);
    const capturedContext = context.with(request, () => withScope(rootScope, () => context.active()));
    const capturedIsolation = context.with(capturedContext, getIsolationScope);
    setAsyncLocalStorageAsyncContextStrategy();

    await withScope(async child => {
      setOpenTelemetryContextAsyncContextStrategy();
      expect(getActiveSpan(child)).toBe(span);
      await withScope(child, async scope => {
        await setImmediate();
        expect(scope).toBe(child);
        expect(getIsolationScope()).toBe(capturedIsolation);
        expect(context.active().getValue(key)).toBe('source');
      });
    });
  });

  it('restores the caller after the rebound plain scope rejects', async () => {
    expect.assertions(6);
    setOpenTelemetryContextAsyncContextStrategy();
    const request = trace.setSpan(context.active(), span);
    const failure = new Error('request failed');

    await context.with(request, async () => {
      const parentScope = getCurrentScope();
      const parentIsolation = getIsolationScope();
      setAsyncLocalStorageAsyncContextStrategy();
      await withIsolationScope(async isolation => {
        const current = getCurrentScope();
        setOpenTelemetryContextAsyncContextStrategy();
        await expect(
          withScope(current, async () => {
            await setImmediate();
            expect(getIsolationScope()).toBe(isolation);
            throw failure;
          }),
        ).rejects.toBe(failure);
        expect(getCurrentScope()).toBe(current);
        expect(getIsolationScope()).toBe(isolation);
      });
      expect(getCurrentScope()).toBe(parentScope);
      expect(getIsolationScope()).toBe(parentIsolation);
    });
  });
});
