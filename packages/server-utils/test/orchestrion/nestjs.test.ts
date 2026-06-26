import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  Client,
  createTransport,
  getActiveSpan,
  getCurrentScope,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  getGlobalScope,
  getIsolationScope,
  initAndBind,
  resolvedSyncPromise,
  setAsyncContextStrategy,
  spanToJSON,
} from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nestjsChannelIntegration } from '../../src/orchestrion';
import { CHANNELS } from '../../src/orchestrion/channels';

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

describe('nestjsChannelIntegration: app_creation', () => {
  afterEach(() => {
    setAsyncContextStrategy(undefined);
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
    getIsolationScope().clear();
    getGlobalScope().clear();
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
    nestjsChannelIntegration().setupOnce!();

    const { getSpan } = captureSpan();
    const channel = tracingChannel<NestFactoryCreateData>(CHANNELS.NESTJS_APP_CREATION);

    class AppModule {}
    await channel.tracePromise(async () => ({ app: true }), { arguments: [AppModule], moduleVersion: '10.4.1' });

    const span = getSpan();
    expect(span).toBeDefined();
    const json = spanToJSON(span!);
    expect(json.description).toBe('Create Nest App');
    expect(json.op).toBe('app_creation.nestjs');
    expect(json.origin).toBe('auto.http.otel.nestjs');
    expect(json.data).toMatchObject({
      component: '@nestjs/core',
      'nestjs.type': 'app_creation',
      'nestjs.version': '10.4.1',
      'nestjs.module': 'AppModule',
    });
    // Span was ended on `asyncEnd`.
    expect(json.timestamp).toBeDefined();
  });

  it('omits optional attributes when version/module are absent', async () => {
    installTestAsyncContextStrategy();
    initTestClient();
    nestjsChannelIntegration().setupOnce!();

    const { getSpan } = captureSpan();
    const channel = tracingChannel<NestFactoryCreateData>(CHANNELS.NESTJS_APP_CREATION);

    await channel.tracePromise(async () => ({ app: true }), { arguments: [] });

    const json = spanToJSON(getSpan()!);
    expect(json.data['nestjs.version']).toBeUndefined();
    expect(json.data['nestjs.module']).toBeUndefined();
    expect(json.data['nestjs.type']).toBe('app_creation');
  });
});

type AnyFn = (this: unknown, ...args: unknown[]) => unknown;

interface RouterCreateData {
  arguments: unknown[];
  moduleVersion?: string;
  result?: unknown;
  error?: unknown;
}

describe('nestjsChannelIntegration: request_context / request_handler', () => {
  afterEach(() => {
    setAsyncContextStrategy(undefined);
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  // Drives `RouterExecutionContext.create` over the channel: the subscriber's
  // `start` wraps the callback arg, its `end` replaces the returned handler
  // (mutableResult). `makeHandler` stands in for the real `create` body. Returns
  // the effective return (post-mutableResult, i.e. `data.result`) and the
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
    nestjsChannelIntegration().setupOnce!();

    class CatsController {}
    const instance = new CatsController();
    function getCats(): string {
      return 'cats';
    }

    let contextSpanJson: ReturnType<typeof spanToJSON> | undefined;
    const { effectiveHandler } = driveCreate(instance, getCats, '10.4.1', () => {
      // The per-request handler `create` returns. Capture the active span here:
      // when invoked it runs inside the request_context span.
      return function perRequest(): unknown {
        contextSpanJson = spanToJSON(getActiveSpan()!);
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
    expect(contextSpanJson!.description).toBe('CatsController.getCats');
    expect(contextSpanJson!.op).toBe('request_context.nestjs');
    expect(contextSpanJson!.origin).toBe('auto.http.otel.nestjs');
    expect(contextSpanJson!.data).toMatchObject({
      component: '@nestjs/core',
      'nestjs.type': 'request_context',
      'nestjs.controller': 'CatsController',
      'nestjs.callback': 'getCats',
      'nestjs.version': '10.4.1',
      'http.route': '/cats',
      'http.method': 'GET',
      'http.url': '/cats?q=1',
    });
  });

  it('wraps the callback arg into a request_handler span, preserving its name', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    nestjsChannelIntegration().setupOnce!();

    class CatsController {}
    const instance = new CatsController();
    let handlerSpanJson: ReturnType<typeof spanToJSON> | undefined;
    function getCats(): string {
      handlerSpanJson = spanToJSON(getActiveSpan()!);
      return 'cats';
    }

    const { wrappedCallback } = driveCreate(instance, getCats, '10.4.1', () => () => undefined);

    // `create`'s callback arg was replaced with a wrapper that preserves `.name`.
    expect(wrappedCallback).not.toBe(getCats);
    expect(wrappedCallback.name).toBe('getCats');

    wrappedCallback.call(instance);

    expect(handlerSpanJson).toBeDefined();
    expect(handlerSpanJson!.description).toBe('getCats');
    expect(handlerSpanJson!.op).toBe('handler.nestjs');
    expect(handlerSpanJson!.origin).toBe('auto.http.otel.nestjs');
    expect(handlerSpanJson!.data).toMatchObject({
      component: '@nestjs/core',
      'nestjs.type': 'handler',
      'nestjs.callback': 'getCats',
      'nestjs.version': '10.4.1',
    });
  });

  it('nests the request_handler span under the request_context span', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    nestjsChannelIntegration().setupOnce!();

    class CatsController {}
    const instance = new CatsController();
    let contextSpanId: string | undefined;
    let handlerParentSpanId: string | undefined;
    function getCats(): string {
      handlerParentSpanId = spanToJSON(getActiveSpan()!).parent_span_id;
      return 'cats';
    }

    // The per-request handler calls the (wrapped) callback, like the real one.
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

describe('nestjsChannelIntegration: @Injectable (middleware/guard/pipe/interceptor)', () => {
  afterEach(() => {
    setAsyncContextStrategy(undefined);
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
    getIsolationScope().clear();
    getGlobalScope().clear();
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
    nestjsChannelIntegration().setupOnce!();

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
    const json = spanToJSON(spanInside!);
    expect(json.description).toBe('LoggerMiddleware');
    expect(json.op).toBe('middleware.nestjs');
    expect(json.origin).toBe('auto.middleware.nestjs');
    // startSpanManual span ends when the proxied `next` is called.
    expect(json.timestamp).toBeDefined();
  });

  it('guard: wraps `canActivate` in a span and preserves its return value', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    nestjsChannelIntegration().setupOnce!();

    let spanInside: ReturnType<typeof getActiveSpan>;
    class AuthGuard {
      public canActivate(_ctx: unknown): boolean {
        spanInside = getActiveSpan();
        return true;
      }
    }
    applyInjectable(AuthGuard);

    expect(new AuthGuard().canActivate({ ctx: true })).toBe(true);
    const json = spanToJSON(spanInside!);
    expect(json.description).toBe('AuthGuard');
    expect(json.op).toBe('middleware.nestjs');
    expect(json.origin).toBe('auto.middleware.nestjs.guard');
  });

  it('pipe: wraps `transform` in a span and preserves its return value', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    nestjsChannelIntegration().setupOnce!();

    let spanInside: ReturnType<typeof getActiveSpan>;
    class ParseIntPipe {
      public transform(value: string, _metadata: unknown): number {
        spanInside = getActiveSpan();
        return Number.parseInt(value, 10);
      }
    }
    applyInjectable(ParseIntPipe);

    expect(new ParseIntPipe().transform('42', { type: 'param' })).toBe(42);
    const json = spanToJSON(spanInside!);
    expect(json.description).toBe('ParseIntPipe');
    expect(json.op).toBe('middleware.nestjs');
    expect(json.origin).toBe('auto.middleware.nestjs.pipe');
  });

  it('interceptor: opens a before-span (ended at next.handle) and instruments the returned observable', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    nestjsChannelIntegration().setupOnce!();

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

    // Passthrough: the same observable is returned (with `subscribe` proxied).
    expect(returned).toBe(observable);

    const beforeJson = spanToJSON(beforeSpan!);
    expect(beforeJson.description).toBe('LoggingInterceptor');
    expect(beforeJson.op).toBe('middleware.nestjs');
    expect(beforeJson.origin).toBe('auto.middleware.nestjs.interceptor');
    // before-span ends when `next.handle()` is called.
    expect(beforeJson.timestamp).toBeDefined();

    // The returned observable was instrumented: subscribing registers an
    // after-span teardown (proving the after-span was created).
    returned.subscribe();
    expect(teardowns).toHaveLength(1);
    expect(() => teardowns.forEach(fn => fn())).not.toThrow();
  });

  it('skips targets flagged __SENTRY_INTERNAL__', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    nestjsChannelIntegration().setupOnce!();

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

describe('nestjsChannelIntegration: @Catch (exception filter)', () => {
  afterEach(() => {
    setAsyncContextStrategy(undefined);
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  function applyCatch(target: object): void {
    tracingChannel<{ arguments: unknown[] }>(CHANNELS.NESTJS_CATCH).traceSync(() => undefined, {
      arguments: [target],
    });
  }

  it('wraps `catch` in an exception_filter span and preserves its return value', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    nestjsChannelIntegration().setupOnce!();

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

    const json = spanToJSON(spanInside!);
    expect(json.description).toBe('HttpExceptionFilter');
    expect(json.op).toBe('middleware.nestjs');
    expect(json.origin).toBe('auto.middleware.nestjs.exception_filter');
  });

  it('does not open a span when exception or host is absent', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    nestjsChannelIntegration().setupOnce!();

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
});

describe('nestjsChannelIntegration: schedule / event / bullmq', () => {
  afterEach(() => {
    setAsyncContextStrategy(undefined);
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
    getIsolationScope().clear();
    getGlobalScope().clear();
    vi.restoreAllMocks();
  });

  // Drive a decorator-factory channel: node's traceSync sets `data.result` to
  // the factory's return (our `originalDecorator`), then the subscriber's `end`
  // (mutableResult) replaces it. Returns the effective (wrapped) decorator.
  function driveFactory(channelName: string, factoryArgs: unknown[], originalDecorator: AnyFn): AnyFn {
    const data: { arguments: unknown[]; result?: unknown } = { arguments: factoryArgs };
    tracingChannel<{ arguments: unknown[]; result?: unknown }>(channelName).traceSync(() => originalDecorator, data);
    return data.result as AnyFn;
  }

  it('schedule @Cron: wraps the handler with isolation scope + error capture, preserving name', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    nestjsChannelIntegration().setupOnce!();
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
    nestjsChannelIntegration().setupOnce!();
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
    nestjsChannelIntegration().setupOnce!();

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

    const json = spanToJSON(spanInside!);
    expect(json.description).toBe('event user.created');
    expect(json.op).toBe('event.nestjs');
    expect(json.origin).toBe('auto.event.nestjs');
  });

  it('bullmq @Processor: patches `process` into a queue.process transaction (string queue name)', async () => {
    installTestAsyncContextStrategy();
    initTestClient();
    nestjsChannelIntegration().setupOnce!();

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
    const json = spanToJSON(spanInside!);
    expect(json.description).toBe('emails process');
    expect(json.op).toBe('queue.process');
    expect(json.origin).toBe('auto.queue.nestjs.bullmq');
    expect(json.data).toMatchObject({
      'messaging.system': 'bullmq',
      'messaging.destination.name': 'emails',
    });
  });

  it('bullmq @Processor: derives the queue name from an options object', () => {
    installTestAsyncContextStrategy();
    initTestClient();
    nestjsChannelIntegration().setupOnce!();

    const wrappedDecorator = driveFactory(CHANNELS.NESTJS_PROCESSOR, [{ name: 'reports' }], () => undefined);

    let spanInside: Span | undefined;
    class ReportsProcessor {
      public async process(): Promise<void> {
        spanInside = getActiveSpan();
      }
    }
    wrappedDecorator(ReportsProcessor);
    return new ReportsProcessor().process().then(() => {
      expect(spanToJSON(spanInside!).description).toBe('reports process');
    });
  });
});
