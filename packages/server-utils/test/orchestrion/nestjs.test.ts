import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
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
import { afterEach, describe, expect, it } from 'vitest';
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
      'component': '@nestjs/core',
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
      'component': '@nestjs/core',
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
