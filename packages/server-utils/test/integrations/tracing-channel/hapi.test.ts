import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  Client,
  createTransport,
  getClient,
  getCurrentScope,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  getGlobalScope,
  getIsolationScope,
  initAndBind,
  resolvedSyncPromise,
  setAsyncContextStrategy,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hapiChannelIntegration } from '../../../src/integrations/tracing-channel/hapi';
import { CHANNELS } from '../../../src/orchestrion/channels';

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
  initAndBind(TestClient, {
    dsn: 'https://username@domain/123',
    integrations: [],
    sendClientReports: false,
    stackParser: () => [],
    tracesSampleRate: 1,
    transport: () =>
      createTransport(
        {
          recordDroppedEvent: () => undefined,
        },
        () => resolvedSyncPromise({}),
      ),
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

// Capture ended spans as plain JSON for assertions.
function collectSpans(): Array<ReturnType<typeof spanToJSON>> {
  const collected: Array<ReturnType<typeof spanToJSON>> = [];
  getClient()!.on('spanEnd', (span: Span) => {
    collected.push(spanToJSON(span));
  });
  return collected;
}

function publishRoute(args: unknown[], pluginName?: string): void {
  tracingChannel(CHANNELS.HAPI_ROUTE).start.publish({
    self: { realm: { plugin: pluginName } },
    arguments: args,
  });
}

function publishExt(args: unknown[], pluginName?: string): void {
  tracingChannel(CHANNELS.HAPI_EXT).start.publish({
    self: { realm: { plugin: pluginName } },
    arguments: args,
  });
}

describe('hapiChannelIntegration', () => {
  // Subscribe exactly once for the whole suite. `diagnostics_channel` subscribers
  // are process-global and accumulate, so re-running `setupOnce` per test would
  // stack subscribers — mirroring production, where `setupOnce` runs once.
  beforeAll(() => {
    hapiChannelIntegration().setupOnce!();
  });

  beforeEach(() => {
    installTestAsyncContextStrategy();
    initTestClient();
  });

  afterEach(() => {
    setAsyncContextStrategy(undefined);
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  it('wraps a directly-registered route handler and creates a router span', () => {
    const collected = collectSpans();

    let called = 0;
    const handler = (): string => {
      called++;
      return 'handler-result';
    };
    const route = { method: 'get', path: '/users/{id}', handler };
    const args: unknown[] = [route];

    publishRoute(args);

    // Invoke the now-swapped handler the way hapi would: inside the active HTTP server span.
    let result: unknown;
    startSpan({ name: 'GET /users/{id}', op: 'http.server' }, () => {
      result = (route.handler as () => unknown)();
    });

    expect(called).toBe(1);
    expect(result).toBe('handler-result');

    const routerSpans = collected.filter(s => s.op === 'router.hapi');
    expect(routerSpans).toHaveLength(1);
    const span = routerSpans[0]!;
    expect(span.description).toBe('route - /users/{id}');
    expect(span.origin).toBe('auto.http.orchestrion.hapi');
    expect(span.data['http.route']).toBe('/users/{id}');
    expect(span.data['http.method']).toBe('get');
    expect(span.data['hapi.type']).toBe('router');
  });

  it('attributes a route to its plugin when the server realm carries a plugin name', () => {
    const collected = collectSpans();

    const handler = (): string => 'ok';
    const route = { method: 'get', path: '/users/{id}', handler };
    const args: unknown[] = [route];

    publishRoute(args, 'my-plugin');

    startSpan({ name: 'GET /users/{id}', op: 'http.server' }, () => {
      (route.handler as () => unknown)();
    });

    const pluginSpans = collected.filter(s => s.op === 'plugin.hapi');
    expect(pluginSpans).toHaveLength(1);
    const span = pluginSpans[0]!;
    expect(span.description).toBe('my-plugin: route - /users/{id}');
    expect(span.origin).toBe('auto.http.orchestrion.hapi');
    expect(span.data['hapi.type']).toBe('plugin');
    expect(span.data['hapi.plugin.name']).toBe('my-plugin');
  });

  it('wraps every handler in a route array', () => {
    const collected = collectSpans();

    const routeA = { method: 'get', path: '/a', handler: (): string => 'a' };
    const routeB = { method: 'post', path: '/b', handler: (): string => 'b' };
    const args: unknown[] = [[routeA, routeB]];

    publishRoute(args);

    let resultA: unknown;
    let resultB: unknown;
    startSpan({ name: 'GET /a', op: 'http.server' }, () => {
      resultA = (routeA.handler as () => unknown)();
    });
    startSpan({ name: 'POST /b', op: 'http.server' }, () => {
      resultB = (routeB.handler as () => unknown)();
    });

    expect(resultA).toBe('a');
    expect(resultB).toBe('b');

    const routerSpans = collected.filter(s => s.op === 'router.hapi');
    expect(routerSpans).toHaveLength(2);
    expect(routerSpans.map(s => s.description).sort()).toEqual(['route - /a', 'route - /b']);
  });

  it('does not create a span when there is no active span, but still calls the handler', () => {
    const collected = collectSpans();

    let called = 0;
    const handler = (): string => {
      called++;
      return 'no-span-result';
    };
    const route = { method: 'get', path: '/users/{id}', handler };
    const args: unknown[] = [route];

    publishRoute(args);

    // Invoke directly, with NO active span.
    const result = (route.handler as () => unknown)();

    expect(called).toBe(1);
    expect(result).toBe('no-span-result');
    expect(collected.filter(s => s.op === 'router.hapi')).toHaveLength(0);
  });

  it('is idempotent: publishing start twice wraps the handler only once', () => {
    const collected = collectSpans();

    let called = 0;
    const handler = (): string => {
      called++;
      return 'ok';
    };
    const route = { method: 'get', path: '/users/{id}', handler };
    const args: unknown[] = [route];

    publishRoute(args);
    publishRoute(args);

    startSpan({ name: 'GET /users/{id}', op: 'http.server' }, () => {
      (route.handler as () => unknown)();
    });

    expect(called).toBe(1);
    expect(collected.filter(s => s.op === 'router.hapi')).toHaveLength(1);
  });

  it('wraps an ext method given as an event object and creates a server.ext span', () => {
    const collected = collectSpans();

    let called = 0;
    // Anonymous (no inferred `.name`) so the span name stays `ext - onPreHandler`;
    // a named method would append `- <name>` per `getExtMetadata`.
    const extEvent = {
      type: 'onPreHandler',
      method: function (): string {
        called++;
        return 'ext-result';
      },
    };
    const args: unknown[] = [extEvent];

    publishExt(args);

    let result: unknown;
    startSpan({ name: 'GET /', op: 'http.server' }, () => {
      result = (extEvent.method as () => unknown)();
    });

    expect(called).toBe(1);
    expect(result).toBe('ext-result');

    const extSpans = collected.filter(s => s.op === 'server.ext.hapi');
    expect(extSpans).toHaveLength(1);
    const span = extSpans[0]!;
    expect(span.description).toBe('ext - onPreHandler');
    expect(span.origin).toBe('auto.http.orchestrion.hapi');
    expect(span.data['hapi.type']).toBe('server.ext');
    expect(span.data['server.ext.type']).toBe('onPreHandler');
  });

  it('wraps an ext method given as a tuple and creates a server.ext span', () => {
    const collected = collectSpans();

    const args: unknown[] = [
      'onPreHandler',
      function (): string {
        return 'ext-result';
      },
      {},
    ];

    publishExt(args);

    let result: unknown;
    startSpan({ name: 'GET /', op: 'http.server' }, () => {
      result = (args[1] as () => unknown)();
    });

    expect(result).toBe('ext-result');

    const extSpans = collected.filter(s => s.op === 'server.ext.hapi');
    expect(extSpans).toHaveLength(1);
    const span = extSpans[0]!;
    expect(span.description).toBe('ext - onPreHandler');
    expect(span.data['hapi.type']).toBe('server.ext');
    expect(span.data['server.ext.type']).toBe('onPreHandler');
  });
});
