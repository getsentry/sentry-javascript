import { setImmediate } from 'node:timers/promises';
import type { Context } from '@opentelemetry/api';
import { context, createContextKey, trace, TraceFlags } from '@opentelemetry/api';
import { getCurrentScope, getIsolationScope, getMainCarrier, Scope, withIsolationScope, withScope } from '@sentry/core';
import type { AsyncLocalStorageLookup } from '@sentry/opentelemetry';
import { getScopesFromContext, setOpenTelemetryContextAsyncContextStrategy } from '@sentry/opentelemetry';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function readScopes(lookup: AsyncLocalStorageLookup): { scope: Scope; isolationScope: Scope } {
  const store = lookup.asyncLocalStorage.getStore();
  return (lookup.contextSymbol ? (store as Context).getValue(lookup.contextSymbol) : store) as {
    scope: Scope;
    isolationScope: Scope;
  };
}

describe('async context strategy compatibility', () => {
  beforeEach(() => {
    context.disable();
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    context.disable();
    getMainCarrier().__SENTRY__ = undefined;
  });

  it('keeps the current scope when installing OpenTelemetry inside a plain isolation scope', () => {
    expect.assertions(2);
    setAsyncLocalStorageAsyncContextStrategy();

    withIsolationScope(isolationScope => {
      const scope = getCurrentScope();
      setOpenTelemetryContextAsyncContextStrategy();

      expect(getCurrentScope()).toBe(scope);
      expect(getIsolationScope()).toBe(isolationScope);
    });
  });

  it('allows an OpenTelemetry span read after installing the plain strategy', () => {
    expect.assertions(1);
    setOpenTelemetryContextAsyncContextStrategy();
    setAsyncLocalStorageAsyncContextStrategy();

    withIsolationScope(() => {
      expect(trace.getSpan(context.active())).toBeUndefined();
    });
  });

  it.each([
    {
      name: 'withScope',
      run: (callback: (scope: Scope) => Promise<void>) => withScope(callback),
      currentScope: getCurrentScope,
    },
    {
      name: 'withScope with an explicit scope',
      run: (callback: (scope: Scope) => Promise<void>) => withScope(new Scope(), callback),
      currentScope: getCurrentScope,
    },
    {
      name: 'withIsolationScope',
      run: (callback: (scope: Scope) => Promise<void>) => withIsolationScope(callback),
      currentScope: getIsolationScope,
    },
    {
      name: 'withIsolationScope with an explicit scope',
      run: (callback: (scope: Scope) => Promise<void>) => withIsolationScope(new Scope(), callback),
      currentScope: getIsolationScope,
    },
  ])('preserves the active span and unrelated context through plain $name', async ({ run, currentScope }) => {
    expect.assertions(9);
    setOpenTelemetryContextAsyncContextStrategy();
    const requestKey = createContextKey('request-id');
    const span = trace.wrapSpanContext({
      traceId: '12345678901234567890123456789012',
      spanId: '1234567890123456',
      traceFlags: TraceFlags.SAMPLED,
    });
    const parentContext = trace.setSpan(context.active().setValue(requestKey, 'request-42'), span);

    await context.with(parentContext, async () => {
      const parentScope = getCurrentScope();
      const parentIsolationScope = getIsolationScope();
      setAsyncLocalStorageAsyncContextStrategy();

      await run(async scope => {
        await setImmediate();

        expect(currentScope()).toBe(scope);
        const contextScopes = getScopesFromContext(context.active());
        expect(contextScopes?.scope).toBe(getCurrentScope());
        expect(contextScopes?.isolationScope).toBe(getIsolationScope());
        expect(trace.getSpan(context.active())).toBe(span);
        expect(context.active().getValue(requestKey)).toBe('request-42');
      });

      expect(getCurrentScope()).toBe(parentScope);
      expect(getIsolationScope()).toBe(parentIsolationScope);
      expect(trace.getSpan(context.active())).toBe(span);
      expect(context.active().getValue(requestKey)).toBe('request-42');
    });
  });

  it('keeps captured lookups live across OpenTelemetry to plain to OpenTelemetry setup', async () => {
    expect.assertions(8);
    const firstLookup = setOpenTelemetryContextAsyncContextStrategy();
    const plainStorage = setAsyncLocalStorageAsyncContextStrategy();
    const lastLookup = setOpenTelemetryContextAsyncContextStrategy();

    expect(plainStorage).toBe(firstLookup.asyncLocalStorage);
    expect(lastLookup.asyncLocalStorage).toBe(firstLookup.asyncLocalStorage);

    await withIsolationScope(async isolationScope => {
      const scope = getCurrentScope();
      await setImmediate();

      expect(getCurrentScope()).toBe(scope);
      expect(getIsolationScope()).toBe(isolationScope);
      expect(readScopes(firstLookup).scope).toBe(scope);
      expect(readScopes(firstLookup).isolationScope).toBe(isolationScope);
      expect(readScopes(lastLookup).scope).toBe(scope);
      expect(readScopes(lastLookup).isolationScope).toBe(isolationScope);
    });
  });

  it.each([
    { kind: 'original', capture: (scope: Scope) => scope },
    { kind: 'cloned', capture: (scope: Scope) => scope.clone() },
  ])(
    'preserves a captured $kind scope context after reusing the scope with the plain strategy',
    async ({ capture }) => {
      expect.assertions(4);
      setOpenTelemetryContextAsyncContextStrategy();
      const requestKey = createContextKey('captured-request');
      const captured = context.with(context.active().setValue(requestKey, 'source'), () =>
        withIsolationScope(isolationScope => ({ scope: capture(getCurrentScope()), isolationScope })),
      );

      await context.with(context.active().setValue(requestKey, 'caller'), async () => {
        setAsyncLocalStorageAsyncContextStrategy();
        await withScope(captured.scope, async () => {
          // Reading the active context must not rebind the captured scope.
          context.active();
          await setImmediate();
        });
        setOpenTelemetryContextAsyncContextStrategy();

        await withScope(captured.scope, async scope => {
          await setImmediate();

          expect(scope).toBe(captured.scope);
          expect(getCurrentScope()).toBe(captured.scope);
          expect(getIsolationScope()).toBe(captured.isolationScope);
          expect(context.active().getValue(requestKey)).toBe('source');
        });
      });
    },
  );

  it.each([
    {
      name: 'plain',
      install: (): AsyncLocalStorageLookup => ({ asyncLocalStorage: setAsyncLocalStorageAsyncContextStrategy() }),
    },
    { name: 'OpenTelemetry', install: setOpenTelemetryContextAsyncContextStrategy },
  ])('keeps captured $name lookups live after repeated setup inside an active scope', async ({ install }) => {
    expect.assertions(5);
    const firstLookup = install();

    await withIsolationScope(async isolationScope => {
      const scope = getCurrentScope();
      const secondLookup = install();
      await setImmediate();

      expect(secondLookup.asyncLocalStorage).toBe(firstLookup.asyncLocalStorage);
      expect(getCurrentScope()).toBe(scope);
      expect(getIsolationScope()).toBe(isolationScope);
      expect(readScopes(firstLookup).scope).toBe(scope);
      expect(readScopes(firstLookup).isolationScope).toBe(isolationScope);
    });
  });
});
