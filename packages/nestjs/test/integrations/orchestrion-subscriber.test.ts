import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  Client,
  createTransport,
  getActiveSpan,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  initAndBind,
  resolvedSyncPromise,
  setAsyncContextStrategy,
  spanToStreamedSpanJSON,
} from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nestjsChannels as CHANNELS } from '@sentry/server-utils/orchestrion';
import { subscribeToNestChannels } from '../../src/integrations/orchestrion-subscriber';

// Mirrors harness in `tracing-channel.test.ts`: `bindTracingChannelToSpan`
// only creates/ends spans when an async-context binding is available, so the
// strategy below must be installed for the subscriber to do anything.
interface TestStore {
  scope: Scope;
  isolationScope: Scope;
}

class TestClient extends Client<any> {
  public eventFromException(): PromiseLike<any> {
    return resolvedSyncPromise({});
  }

  public eventFromMessage(): PromiseLike<any> {
    return resolvedSyncPromise({});
  }
}

function initTestClient(): void {
  //@ts-expect-error - just a mock for the test, this is fine
  initAndBind(TestClient, {
    dsn: 'https://username@domain/123',
    integrations: [],
    sendClientReports: false,
    stackParser: () => [],
    tracesSampleRate: 1,
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, () => resolvedSyncPromise({})),
  });
}

function installTestAsyncContextStrategy(): void {
  const asyncStorage = new AsyncLocalStorage<TestStore>();

  function getScopes(): TestStore {
    return (
      asyncStorage.getStore() || {
        scope: getDefaultCurrentScope(),
        isolationScope: getDefaultIsolationScope(),
      }
    );
  }

  setAsyncContextStrategy({
    withScope: callback => {
      const scope = getScopes().scope.clone();
      const isolationScope = getScopes().isolationScope;
      return asyncStorage.run({ scope, isolationScope }, () => callback(scope));
    },
    withSetScope: (scope, callback) => {
      const isolationScope = getScopes().isolationScope;
      return asyncStorage.run({ scope, isolationScope }, () => callback(scope));
    },
    withIsolationScope: callback => {
      const scope = getScopes().scope;
      const isolationScope = getScopes().isolationScope.clone();
      return asyncStorage.run({ scope, isolationScope }, () => callback(isolationScope));
    },
    withSetIsolationScope: (isolationScope, callback) => {
      const scope = getScopes().scope;
      return asyncStorage.run({ scope, isolationScope }, () => callback(isolationScope));
    },
    getCurrentScope: () => getScopes().scope,
    getIsolationScope: () => getScopes().isolationScope,
    getTracingChannelBinding: () => ({
      asyncLocalStorage: asyncStorage,
      getStoreWithActiveSpan: span => {
        const scope = getScopes().scope.clone();
        const isolationScope = getScopes().isolationScope;
        _INTERNAL_setSpanForScope(scope, span);
        return { scope, isolationScope };
      },
    }),
  });
}

interface NestFactoryCreateData {
  arguments: unknown[];
  moduleVersion?: string;
  result?: unknown;
  error?: unknown;
}

describe('NestJS orchestrion subscriber: app_creation', () => {
  afterEach(() => {
    setAsyncContextStrategy(undefined);
    SentryCore.getMainCarrier().__SENTRY__ = undefined;
  });

  // Grab the bound span off the channel payload so we can assert on it
  // after the operation settles. subscriber stamps it at `start` on
  // `data._sentrySpan`
  function captureSpan(): { getSpan: () => Span | undefined } {
    let span: Span | undefined;
    const grab = (data: NestFactoryCreateData): void => {
      span ??= (data as { _sentrySpan?: Span })._sentrySpan;
    };
    // The raw node `tracingChannel` type wants all five handlers; only
    // `end`/`asyncEnd` carry the bound span by the time it settles.
    tracingChannel<NestFactoryCreateData>(CHANNELS.NESTJS_APP_CREATION).subscribe({
      start: () => undefined,
      asyncStart: () => undefined,
      asyncEnd: grab,
      end: grab,
      error: () => undefined,
    });
    return { getSpan: () => span };
  }

  it('opens a "Create Nest App" span with the OTel-compatible op/origin/attributes', async () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    const { getSpan } = captureSpan();
    const channel = tracingChannel<NestFactoryCreateData>(CHANNELS.NESTJS_APP_CREATION);

    class AppModule {}
    await channel.tracePromise(async () => ({ app: true }), { arguments: [AppModule], moduleVersion: '10.4.1' });

    const span = getSpan();
    expect(span).toBeDefined();
    const json = spanToStreamedSpanJSON(span!);
    expect(json.name).toBe('Create Nest App');
    expect(json.attributes['sentry.op']).toBe('function');
    expect(json.attributes['sentry.origin']).toBe('auto.http.nestjs');
    expect(json.attributes).toMatchObject({
      component: '@nestjs/core',
      'nestjs.type': 'app_creation',
      'nestjs.version': '10.4.1',
      'nestjs.module': 'AppModule',
    });
    // Span was ended on `asyncEnd`.
    expect(json.end_timestamp).toBeDefined();
  });

  it('omits optional attributes when version/module are absent', async () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    const { getSpan } = captureSpan();
    const channel = tracingChannel<NestFactoryCreateData>(CHANNELS.NESTJS_APP_CREATION);

    await channel.tracePromise(async () => ({ app: true }), { arguments: [] });

    const json = spanToStreamedSpanJSON(getSpan()!);
    expect(json.attributes['nestjs.version']).toBeUndefined();
    expect(json.attributes['nestjs.module']).toBeUndefined();
    expect(json.attributes['nestjs.type']).toBe('app_creation');
  });
});

type AnyFn = (this: unknown, ...args: unknown[]) => unknown;

interface RouterCreateData {
  arguments: unknown[];
  moduleVersion?: string;
  result?: unknown;
  error?: unknown;
}

describe('NestJS orchestrion subscriber: request_context / request_handler', () => {
  afterEach(() => {
    setAsyncContextStrategy(undefined);
    SentryCore.getMainCarrier().__SENTRY__ = undefined;
  });

  // Drives `RouterExecutionContext.create` over the channel: the subscriber's
  // `start` wraps the callback arg, its `end` reassigns the returned handler on
  // `data.result`. `makeHandler` stands in for the real `create` body. Returns
  // the effective return (the substituted `data.result`) and the
  // wrapped callback (`data.arguments[1]`).
  function driveCreate(
    instance: object,
    callback: AnyFn,
    moduleVersion: string | undefined,
    makeHandler: (data: RouterCreateData) => AnyFn,
  ): { effectiveHandler: AnyFn; wrappedCallback: AnyFn } {
    const channel = tracingChannel<RouterCreateData>(CHANNELS.NESTJS_ROUTER_CONTEXT);
    const data: RouterCreateData = { arguments: [instance, callback], moduleVersion };
    channel.traceSync(() => makeHandler(data), data);
    return { effectiveHandler: data.result as AnyFn, wrappedCallback: data.arguments[1] as AnyFn };
  }

  it('opens a request_context span (named Controller.method) with OTel-compatible attributes', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    class CatsController {}
    const instance = new CatsController();
    function getCats(): string {
      return 'cats';
    }

    let contextSpanJson: ReturnType<typeof spanToStreamedSpanJSON> | undefined;
    const { effectiveHandler } = driveCreate(instance, getCats, '10.4.1', () => {
      // The per-request handler `create` returns. Capture the active span
      // here: when invoked it runs inside the request_context span.
      return function perRequest(): unknown {
        contextSpanJson = spanToStreamedSpanJSON(getActiveSpan()!);
        return 'ok';
      };
    });

    effectiveHandler.call(undefined, {
      method: 'GET',
      originalUrl: '/cats?q=1',
      url: '/cats?q=1',
      route: { path: '/cats' },
    });

    expect(contextSpanJson).toBeDefined();
    expect(contextSpanJson!.name).toBe('CatsController.getCats');
    expect(contextSpanJson!.attributes['sentry.op']).toBe('function');
    expect(contextSpanJson!.attributes['sentry.origin']).toBe('auto.http.nestjs');
    expect(contextSpanJson!.attributes).toMatchObject({
      component: '@nestjs/core',
      'nestjs.type': 'request_context',
      'nestjs.controller': 'CatsController',
      'nestjs.callback': 'getCats',
      'nestjs.version': '10.4.1',
      'http.route': '/cats',
      'http.method': 'GET',
      'url.full': '/cats?q=1',
    });
  });

  it('wraps the callback arg into a request_handler span, preserving its name', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    class CatsController {}
    const instance = new CatsController();
    let handlerSpanJson: ReturnType<typeof spanToStreamedSpanJSON> | undefined;
    function getCats(): string {
      handlerSpanJson = spanToStreamedSpanJSON(getActiveSpan()!);
      return 'cats';
    }

    const { wrappedCallback } = driveCreate(instance, getCats, '10.4.1', () => () => undefined);

    // `create`'s callback was replaced with wrapper that preserves `.name`
    expect(wrappedCallback).not.toBe(getCats);
    expect(wrappedCallback.name).toBe('getCats');

    wrappedCallback.call(instance);

    expect(handlerSpanJson).toBeDefined();
    expect(handlerSpanJson!.name).toBe('getCats');
    expect(handlerSpanJson!.attributes['sentry.op']).toBe('handler');
    expect(handlerSpanJson!.attributes['sentry.origin']).toBe('auto.http.nestjs');
    expect(handlerSpanJson!.attributes).toMatchObject({
      component: '@nestjs/core',
      'nestjs.type': 'handler',
      'nestjs.callback': 'getCats',
      'nestjs.version': '10.4.1',
    });
  });

  it('nests the request_handler span under the request_context span', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    class CatsController {}
    const instance = new CatsController();
    let contextSpanId: string | undefined;
    let handlerParentSpanId: string | undefined;
    function getCats(): string {
      handlerParentSpanId = spanToStreamedSpanJSON(getActiveSpan()!).parent_span_id;
      return 'cats';
    }

    // per-request handler calls the (wrapped) callback, like the real one.
    const { effectiveHandler } = driveCreate(instance, getCats, undefined, data => {
      return function perRequest(this: unknown): unknown {
        contextSpanId = getActiveSpan()!.spanContext().spanId;
        return (data.arguments[1] as AnyFn).call(instance);
      };
    });

    effectiveHandler.call(undefined, { method: 'GET', route: { path: '/cats' } });

    expect(contextSpanId).toBeDefined();
    expect(handlerParentSpanId).toBe(contextSpanId);
  });
});

describe('NestJS orchestrion subscriber: @Injectable (middleware/guard/pipe/interceptor)', () => {
  afterEach(() => {
    setAsyncContextStrategy(undefined);
    SentryCore.getMainCarrier().__SENTRY__ = undefined;
  });

  // Fire the @Injectable channel against `target` (as if its decorator arrow
  // ran), so the subscriber's `start` patches `target.prototype`.
  function applyInjectable(target: object): void {
    tracingChannel<{ arguments: unknown[] }>(CHANNELS.NESTJS_INJECTABLE).traceSync(() => undefined, {
      arguments: [target],
    });
  }

  it('middleware: opens a span on `use`, ended when `next()` is called', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    let spanInside: ReturnType<typeof getActiveSpan>;
    class LoggerMiddleware {
      public use(_req: unknown, _res: unknown, next: () => void): void {
        spanInside = getActiveSpan();
        next();
      }
    }
    applyInjectable(LoggerMiddleware);

    const next = vi.fn();
    new LoggerMiddleware().use({ url: '/' }, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const json = spanToStreamedSpanJSON(spanInside!);
    expect(json.name).toBe('LoggerMiddleware');
    expect(json.attributes['sentry.op']).toBe('middleware');
    expect(json.attributes['sentry.origin']).toBe('auto.middleware.nestjs');
    // startSpanManual span ends when the proxied `next` is called.
    expect(json.end_timestamp).toBeDefined();
  });

  it('guard: wraps `canActivate` in a span and preserves its return value', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    let spanInside: ReturnType<typeof getActiveSpan>;
    class AuthGuard {
      public canActivate(_ctx: unknown): boolean {
        spanInside = getActiveSpan();
        return true;
      }
    }
    applyInjectable(AuthGuard);

    expect(new AuthGuard().canActivate({ ctx: true })).toBe(true);
    const json = spanToStreamedSpanJSON(spanInside!);
    expect(json.name).toBe('AuthGuard');
    expect(json.attributes['sentry.op']).toBe('middleware');
    expect(json.attributes['sentry.origin']).toBe('auto.middleware.nestjs.guard');
  });

  it('pipe: wraps `transform` in a span and preserves its return value', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    let spanInside: ReturnType<typeof getActiveSpan>;
    class ParseIntPipe {
      public transform(value: string, _metadata: unknown): number {
        spanInside = getActiveSpan();
        return Number.parseInt(value, 10);
      }
    }
    applyInjectable(ParseIntPipe);

    expect(new ParseIntPipe().transform('42', { type: 'param' })).toBe(42);
    const json = spanToStreamedSpanJSON(spanInside!);
    expect(json.name).toBe('ParseIntPipe');
    expect(json.attributes['sentry.op']).toBe('middleware');
    expect(json.attributes['sentry.origin']).toBe('auto.middleware.nestjs.pipe');
  });

  it('interceptor: opens a before-span (ended at next.handle) and instruments the returned observable', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    // Minimal rxjs-like observable whose subscription records teardown fns.
    const teardowns: Array<() => void> = [];
    const observable = {
      subscribe(): { add: (fn: () => void) => void } {
        return { add: (fn: () => void) => void teardowns.push(fn) };
      },
    };

    let beforeSpan: ReturnType<typeof getActiveSpan>;
    class LoggingInterceptor {
      public intercept(_context: unknown, next: { handle: () => unknown }): unknown {
        beforeSpan = getActiveSpan();
        return next.handle();
      }
    }
    applyInjectable(LoggingInterceptor);

    const next = { handle: () => observable };
    const returned = new LoggingInterceptor().intercept({}, next) as typeof observable;

    // Passthrough: same observable is returned (with `subscribe` proxied).
    expect(returned).toBe(observable);

    const beforeJson = spanToStreamedSpanJSON(beforeSpan!);
    expect(beforeJson.name).toBe('LoggingInterceptor');
    expect(beforeJson.attributes['sentry.op']).toBe('middleware');
    expect(beforeJson.attributes['sentry.origin']).toBe('auto.middleware.nestjs.interceptor');
    // before-span ends when `next.handle()` is called.
    expect(beforeJson.end_timestamp).toBeDefined();

    // The returned observable was instrumented: subscribing registers an
    // after-span teardown (proving the after-span was created).
    returned.subscribe();
    expect(teardowns).toHaveLength(1);
    expect(() => teardowns.forEach(fn => fn())).not.toThrow();
  });

  it('async interceptor that awaits before next.handle(): still instruments the after-span', async () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    const teardowns: Array<() => void> = [];
    const observable = {
      subscribe(): { add: (fn: () => void) => void } {
        return { add: (fn: () => void) => void teardowns.push(fn) };
      },
    };

    let beforeSpan: ReturnType<typeof getActiveSpan>;
    class AsyncInterceptor {
      // Awaits *before* calling `next.handle()`, so `intercept` returns a
      // pending Promise while the after-span does not yet exist.
      public async intercept(_context: unknown, next: { handle: () => unknown }): Promise<unknown> {
        beforeSpan = getActiveSpan();
        await Promise.resolve();
        return next.handle();
      }
    }
    applyInjectable(AsyncInterceptor);

    const next = { handle: () => observable };
    const returned = (await new AsyncInterceptor().intercept({}, next)) as typeof observable;

    expect(returned).toBe(observable);
    // before-span ended (when `next.handle()` ran, post-await)
    expect(spanToStreamedSpanJSON(beforeSpan!).end_timestamp).toBeDefined();
    // after-span was created AND the observable instrumented despite the await
    returned.subscribe();
    expect(teardowns).toHaveLength(1);
    expect(() => teardowns.forEach(fn => fn())).not.toThrow();
  });

  it('async interceptor that never calls next.handle(): ends the before-span, no after-span', async () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    const teardowns: Array<() => void> = [];
    const observable = {
      subscribe(): { add: (fn: () => void) => void } {
        return { add: (fn: () => void) => void teardowns.push(fn) };
      },
    };

    let beforeSpan: ReturnType<typeof getActiveSpan>;
    class ShortCircuitInterceptor {
      public async intercept(_context: unknown, _next: { handle: () => unknown }): Promise<unknown> {
        beforeSpan = getActiveSpan();
        await Promise.resolve();
        return observable; // short-circuits without calling `next.handle()`
      }
    }
    applyInjectable(ShortCircuitInterceptor);

    const next = { handle: vi.fn() };
    const returned = (await new ShortCircuitInterceptor().intercept({}, next)) as typeof observable;

    expect(returned).toBe(observable);
    expect(next.handle).not.toHaveBeenCalled();
    // before-span is closed even though `next.handle()` (which normally
    // ends it) never ran
    expect(spanToStreamedSpanJSON(beforeSpan!).end_timestamp).toBeDefined();
    // no after-span, so the observable is left un-instrumented
    returned.subscribe();
    expect(teardowns).toHaveLength(0);
  });

  it('sync interceptor that short-circuits without next.handle(): ends the before-span', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    const teardowns: Array<() => void> = [];
    const observable = {
      subscribe(): { add: (fn: () => void) => void } {
        return { add: (fn: () => void) => void teardowns.push(fn) };
      },
    };

    let beforeSpan: ReturnType<typeof getActiveSpan>;
    class CachingInterceptor {
      // Synchronously returns an Observable without calling `next.handle()`
      // (a cache/validation short-circuit).
      public intercept(_context: unknown, _next: { handle: () => unknown }): unknown {
        beforeSpan = getActiveSpan();
        return observable;
      }
    }
    applyInjectable(CachingInterceptor);

    const next = { handle: vi.fn() };
    const returned = new CachingInterceptor().intercept({}, next) as typeof observable;

    expect(returned).toBe(observable);
    expect(next.handle).not.toHaveBeenCalled();
    // before-span is closed even though `next.handle()` (which normally
    // ends it) never ran
    expect(spanToStreamedSpanJSON(beforeSpan!).end_timestamp).toBeDefined();
    // no after-span, so the observable is left un-instrumented
    returned.subscribe();
    expect(teardowns).toHaveLength(0);
  });

  it('stacked async interceptors sharing an ExecutionContext: one after-span, no double-end error', async () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    const teardowns: Array<() => void> = [];
    const observable = {
      subscribe(): { add: (fn: () => void) => void } {
        return { add: (fn: () => void) => void teardowns.push(fn) };
      },
    };

    // NestJS shares one ExecutionContext across every interceptor in a
    // chain. Only the first to reach `next.handle()` opens the (single)
    // after-span; the others must still end their own before-span exactly
    // once and must not throw (relies on `span.end()` being idempotent).
    const context = {};
    let outerBefore: ReturnType<typeof getActiveSpan>;
    let innerBefore: ReturnType<typeof getActiveSpan>;
    class OuterInterceptor {
      public async intercept(_ctx: unknown, next: { handle: () => unknown }): Promise<unknown> {
        outerBefore = getActiveSpan();
        return next.handle();
      }
    }
    class InnerInterceptor {
      public async intercept(_ctx: unknown, next: { handle: () => unknown }): Promise<unknown> {
        innerBefore = getActiveSpan();
        return next.handle();
      }
    }
    applyInjectable(OuterInterceptor);
    applyInjectable(InnerInterceptor);

    const inner = new InnerInterceptor();
    const outer = new OuterInterceptor();
    // Simulate the chain: the outer's `next.handle()` runs the inner
    // interceptor with the same context.
    const next2 = { handle: () => observable };
    const next1 = { handle: () => inner.intercept(context, next2) };

    const returned = (await outer.intercept(context, next1)) as typeof observable;

    expect(returned).toBe(observable);
    // Each interceptor opened and ended its own distinct before-span.
    expect(outerBefore).not.toBe(innerBefore);
    expect(spanToStreamedSpanJSON(outerBefore!).end_timestamp).toBeDefined();
    expect(spanToStreamedSpanJSON(innerBefore!).end_timestamp).toBeDefined();
    // Exactly one "Interceptors - After Route" span was created for the
    // shared context.
    returned.subscribe();
    expect(teardowns).toHaveLength(1);
    expect(() => teardowns.forEach(fn => fn())).not.toThrow();
  });

  it('skips targets flagged __SENTRY_INTERNAL__', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    class InternalGuard {
      public canActivate(_ctx: unknown): boolean {
        return true;
      }
    }
    (InternalGuard as unknown as { __SENTRY_INTERNAL__?: boolean }).__SENTRY_INTERNAL__ = true;
    const original = InternalGuard.prototype.canActivate;
    applyInjectable(InternalGuard);

    // Not patched: the prototype method is untouched.
    expect(InternalGuard.prototype.canActivate).toBe(original);
  });
});

describe('NestJS orchestrion subscriber: @Catch (exception filter)', () => {
  afterEach(() => {
    setAsyncContextStrategy(undefined);
    SentryCore.getMainCarrier().__SENTRY__ = undefined;
  });

  function applyCatch(target: object): void {
    tracingChannel<{ arguments: unknown[] }>(CHANNELS.NESTJS_CATCH).traceSync(() => undefined, {
      arguments: [target],
    });
  }

  it('wraps `catch` in an exception_filter span and preserves its return value', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    let spanInside: ReturnType<typeof getActiveSpan>;
    class HttpExceptionFilter {
      public catch(exception: unknown, _host: unknown): string {
        spanInside = getActiveSpan();
        return `handled:${String(exception)}`;
      }
    }
    applyCatch(HttpExceptionFilter);

    const ret = new HttpExceptionFilter().catch('boom', { switchToHttp: () => ({}) });
    expect(ret).toBe('handled:boom');

    const json = spanToStreamedSpanJSON(spanInside!);
    expect(json.name).toBe('HttpExceptionFilter');
    expect(json.attributes['sentry.op']).toBe('middleware');
    expect(json.attributes['sentry.origin']).toBe('auto.middleware.nestjs.exception_filter');
  });

  it('does not open a span when exception or host is absent', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    let spanInside: ReturnType<typeof getActiveSpan> = undefined;
    class HttpExceptionFilter {
      public catch(_exception: unknown, _host: unknown): string {
        spanInside = getActiveSpan();
        return 'ok';
      }
    }
    applyCatch(HttpExceptionFilter);

    // Missing host -> guard short-circuits, no span opened.
    new HttpExceptionFilter().catch('boom', undefined);
    expect(spanInside).toBeUndefined();
  });

  // A class can be decorated with both `@Injectable` and `@Catch` (an
  // exception filter that uses DI). Which channel fires first depends on
  // decorator stacking order (decorators apply inner-first): `@Catch` over
  // `@Injectable` fires @Injectable first; `@Injectable` over `@Catch` fires
  // @Catch first. Because the two passes use separate patched-flags, both
  // must wrap their own methods regardless of which channel fires first.
  function fireInjectable(target: object): void {
    tracingChannel<{ arguments: unknown[] }>(CHANNELS.NESTJS_INJECTABLE).traceSync(() => undefined, {
      arguments: [target],
    });
  }

  it('still wraps `catch` when the @Injectable channel fired first (dual @Injectable @Catch filter)', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    let spanInside: ReturnType<typeof getActiveSpan>;
    class HttpExceptionFilter {
      public catch(exception: unknown, _host: unknown): string {
        spanInside = getActiveSpan();
        return `handled:${String(exception)}`;
      }
    }
    fireInjectable(HttpExceptionFilter);
    applyCatch(HttpExceptionFilter);

    const ret = new HttpExceptionFilter().catch('boom', { switchToHttp: () => ({}) });
    expect(ret).toBe('handled:boom');

    const json = spanToStreamedSpanJSON(spanInside!);
    expect(json.name).toBe('HttpExceptionFilter');
    expect(json.attributes['sentry.op']).toBe('middleware');
    expect(json.attributes['sentry.origin']).toBe('auto.middleware.nestjs.exception_filter');
  });

  it('still wraps `catch` when the @Catch channel fired first (dual @Injectable @Catch filter)', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    let spanInside: ReturnType<typeof getActiveSpan>;
    class HttpExceptionFilter {
      public catch(exception: unknown, _host: unknown): string {
        spanInside = getActiveSpan();
        return `handled:${String(exception)}`;
      }
    }
    applyCatch(HttpExceptionFilter);
    fireInjectable(HttpExceptionFilter);

    const ret = new HttpExceptionFilter().catch('boom', { switchToHttp: () => ({}) });
    expect(ret).toBe('handled:boom');

    const json = spanToStreamedSpanJSON(spanInside!);
    expect(json.name).toBe('HttpExceptionFilter');
    expect(json.attributes['sentry.op']).toBe('middleware');
    expect(json.attributes['sentry.origin']).toBe('auto.middleware.nestjs.exception_filter');
  });

  // A (contrived) class that is BOTH a guard (`canActivate`) and an
  // exception filter (`catch`) proves the two passes are independent:
  // neither ordering may let one pass's patched-flag block the other.
  // Both spans must appear either way.
  for (const order of ['injectable-first', 'catch-first'] as const) {
    it(`wraps BOTH canActivate and catch when the ${order} channel fired first`, () => {
      installTestAsyncContextStrategy();
      initTestClient();
      subscribeToNestChannels();

      let guardSpan: ReturnType<typeof getActiveSpan>;
      let filterSpan: ReturnType<typeof getActiveSpan>;
      class GuardAndFilter {
        public canActivate(_ctx: unknown): boolean {
          guardSpan = getActiveSpan();
          return true;
        }
        public catch(exception: unknown, _host: unknown): string {
          filterSpan = getActiveSpan();
          return `handled:${String(exception)}`;
        }
      }

      if (order === 'injectable-first') {
        fireInjectable(GuardAndFilter);
        applyCatch(GuardAndFilter);
      } else {
        applyCatch(GuardAndFilter);
        fireInjectable(GuardAndFilter);
      }

      expect(new GuardAndFilter().canActivate({ ctx: true })).toBe(true);
      expect(new GuardAndFilter().catch('boom', { switchToHttp: () => ({}) })).toBe('handled:boom');

      expect(spanToStreamedSpanJSON(guardSpan!).attributes['sentry.origin']).toBe('auto.middleware.nestjs.guard');
      expect(spanToStreamedSpanJSON(filterSpan!).attributes['sentry.origin']).toBe(
        'auto.middleware.nestjs.exception_filter',
      );
    });
  }
});

describe('NestJS orchestrion subscriber: schedule / event / bullmq', () => {
  afterEach(() => {
    setAsyncContextStrategy(undefined);
    SentryCore.getMainCarrier().__SENTRY__ = undefined;
    vi.restoreAllMocks();
  });

  // Drive a decorator-factory channel: node's traceSync sets `data.result`
  // to the factory's return (our `originalDecorator`), then the subscriber's
  // `end` reassigns `data.result`. Returns effective (wrapped) decorator.
  function driveFactory(channelName: string, factoryArgs: unknown[], originalDecorator: AnyFn): AnyFn {
    const data: { arguments: unknown[]; result?: unknown } = { arguments: factoryArgs };
    tracingChannel<{ arguments: unknown[]; result?: unknown }>(channelName).traceSync(() => originalDecorator, data);
    return data.result as AnyFn;
  }

  it('schedule @Cron: wraps the handler with isolation scope + error capture, preserving name', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();
    const captureSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');

    let originalCalled = false;
    const original: AnyFn = (_t, _k, descriptor) => {
      originalCalled = true;
      return descriptor;
    };
    const wrappedDecorator = driveFactory(CHANNELS.NESTJS_SCHEDULE_CRON, ['*/5 * * * *'], original);

    const handler = function doCron(): void {
      throw new Error('cron boom');
    };
    const descriptor: PropertyDescriptor = { value: handler, configurable: true };
    wrappedDecorator({}, 'doCron', descriptor);

    expect(originalCalled).toBe(true);
    expect(descriptor.value).not.toBe(handler);
    expect((descriptor.value as AnyFn).name).toBe('doCron');

    expect(() => (descriptor.value as AnyFn)()).toThrow('cron boom');
    expect(captureSpy).toHaveBeenCalledWith(expect.any(Error), {
      mechanism: { handled: false, type: 'auto.function.nestjs.cron' },
    });
  });

  it('schedule @Interval: captures async (rejected) errors with the interval mechanism', async () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();
    const captureSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');

    const wrappedDecorator = driveFactory(CHANNELS.NESTJS_SCHEDULE_INTERVAL, [1000], (_t, _k, d) => d);
    const descriptor: PropertyDescriptor = {
      value: async function doInterval(): Promise<never> {
        throw new Error('interval boom');
      },
      configurable: true,
    };
    wrappedDecorator({}, 'doInterval', descriptor);

    await expect((descriptor.value as AnyFn)()).rejects.toThrow('interval boom');
    expect(captureSpy).toHaveBeenCalledWith(expect.any(Error), {
      mechanism: { handled: false, type: 'auto.function.nestjs.interval' },
    });
  });

  it('event @OnEvent: opens an event.nestjs transaction named from the event', async () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    const wrappedDecorator = driveFactory(CHANNELS.NESTJS_ONEVENT, ['user.created'], (_t, _k, d) => d);

    let spanInside: Span | undefined;
    const descriptor: PropertyDescriptor = {
      value: async function onUserCreated(): Promise<string> {
        spanInside = getActiveSpan();
        return 'ok';
      },
      configurable: true,
    };
    wrappedDecorator({}, 'onUserCreated', descriptor);

    await (descriptor.value as AnyFn)();

    const json = spanToStreamedSpanJSON(spanInside!);
    expect(json.name).toBe('event user.created');
    expect(json.attributes['sentry.op']).toBe('function');
    expect(json.attributes['sentry.origin']).toBe('auto.event.nestjs');
  });

  it('bullmq @Processor: patches `process` into a queue.process transaction (string queue name)', async () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    let originalCalled = false;
    const wrappedDecorator = driveFactory(CHANNELS.NESTJS_PROCESSOR, ['emails'], () => {
      originalCalled = true;
    });

    let spanInside: Span | undefined;
    class EmailProcessor {
      public async process(_job: unknown): Promise<string> {
        spanInside = getActiveSpan();
        return 'done';
      }
    }
    const originalProcess = EmailProcessor.prototype.process;
    wrappedDecorator(EmailProcessor);

    expect(originalCalled).toBe(true);
    expect(EmailProcessor.prototype.process).not.toBe(originalProcess);

    await new EmailProcessor().process({});
    const json = spanToStreamedSpanJSON(spanInside!);
    expect(json.name).toBe('emails process');
    expect(json.attributes['sentry.op']).toBe('queue.process');
    expect(json.attributes['sentry.origin']).toBe('auto.queue.nestjs.bullmq');
    expect(json.attributes).toMatchObject({
      'messaging.system': 'bullmq',
      'messaging.destination.name': 'emails',
    });
  });

  it('bullmq @Processor: derives the queue name from an options object', async () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    const wrappedDecorator = driveFactory(CHANNELS.NESTJS_PROCESSOR, [{ name: 'reports' }], () => undefined);

    let spanInside: Span | undefined;
    class ReportsProcessor {
      public async process(): Promise<void> {
        spanInside = getActiveSpan();
      }
    }
    wrappedDecorator(ReportsProcessor);
    return new ReportsProcessor().process().then(() => {
      expect(spanToStreamedSpanJSON(spanInside!).name).toBe('reports process');
    });
  });

  it('schedule @Timeout: captures sync errors with the timeout mechanism', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();
    const captureSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');

    const wrappedDecorator = driveFactory(CHANNELS.NESTJS_SCHEDULE_TIMEOUT, [1000], (_t, _k, d) => d);
    const descriptor: PropertyDescriptor = {
      value: function doTimeout(): void {
        throw new Error('timeout boom');
      },
      configurable: true,
    };
    wrappedDecorator({}, 'doTimeout', descriptor);

    expect(() => (descriptor.value as AnyFn)()).toThrow('timeout boom');
    expect(captureSpy).toHaveBeenCalledWith(expect.any(Error), {
      mechanism: { handled: false, type: 'auto.function.nestjs.timeout' },
    });
  });

  it('schedule @Cron: skips wrapping handlers flagged __SENTRY_INTERNAL__', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    const wrappedDecorator = driveFactory(CHANNELS.NESTJS_SCHEDULE_CRON, ['*/5 * * * *'], (_t, _k, d) => d);
    const handler = function doCron(): void {};
    const descriptor: PropertyDescriptor = { value: handler, configurable: true };
    wrappedDecorator({ __SENTRY_INTERNAL__: true }, 'doCron', descriptor);

    expect(descriptor.value).toBe(handler);
  });

  it.each([
    { label: 'symbol', event: Symbol('user.created'), expected: 'event Symbol(user.created)' },
    { label: 'string array', event: ['user.created', 'user.updated'], expected: 'event user.created,user.updated' },
    {
      label: 'mixed array',
      event: [Symbol('user.created'), 'user.updated'],
      expected: 'event Symbol(user.created),user.updated',
    },
  ])('event @OnEvent: names the transaction from a $label event', async ({ event, expected }) => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    const wrappedDecorator = driveFactory(CHANNELS.NESTJS_ONEVENT, [event], (_t, _k, d) => d);

    let spanInside: Span | undefined;
    const descriptor: PropertyDescriptor = {
      value: async function onEvent(): Promise<string> {
        spanInside = getActiveSpan();
        return 'ok';
      },
      configurable: true,
    };
    wrappedDecorator({}, 'onEvent', descriptor);

    await (descriptor.value as AnyFn)();

    expect(spanToStreamedSpanJSON(spanInside!).name).toBe(expected);
  });

  it('bullmq @Processor: skips wrapping when the class is flagged __SENTRY_INTERNAL__', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    const wrappedDecorator = driveFactory(CHANNELS.NESTJS_PROCESSOR, ['emails'], () => undefined);

    class InternalProcessor {
      public async process(): Promise<void> {}
    }
    (InternalProcessor as { __SENTRY_INTERNAL__?: boolean }).__SENTRY_INTERNAL__ = true;
    const originalProcess = InternalProcessor.prototype.process;
    wrappedDecorator(InternalProcessor);

    expect(InternalProcessor.prototype.process).toBe(originalProcess);
  });

  it('bullmq @Processor: does not double-wrap the process method', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    subscribeToNestChannels();

    class EmailProcessor {
      public async process(): Promise<void> {}
    }
    const originalProcess = EmailProcessor.prototype.process;

    driveFactory(CHANNELS.NESTJS_PROCESSOR, ['emails'], () => undefined)(EmailProcessor);
    const wrappedProcess = EmailProcessor.prototype.process;
    expect(wrappedProcess).not.toBe(originalProcess);

    driveFactory(CHANNELS.NESTJS_PROCESSOR, ['emails'], () => undefined)(EmailProcessor);
    expect(EmailProcessor.prototype.process).toBe(wrappedProcess);
  });
});
