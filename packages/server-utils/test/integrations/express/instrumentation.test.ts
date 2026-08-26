import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  Client,
  createTransport,
  getActiveSpan,
  getAsyncContextStrategy,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  getMainCarrier,
  initAndBind,
  resolvedSyncPromise,
  setAsyncContextStrategy,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { expressChannels } from '../../../src/orchestrion/config/express';
import { instrumentExpress } from '../../../src/integrations/express/instrumentation';

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

function initTestClient(options: { traceLifecycle?: 'static' | 'stream' } = {}): void {
  //@ts-expect-error - just a mock for the test, this is fine
  initAndBind(TestClient, {
    dsn: 'https://username@domain/123',
    integrations: [],
    sendClientReports: false,
    stackParser: () => [],
    tracesSampleRate: 1,
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, () => resolvedSyncPromise({})),
    ...options,
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
      getStoreWithActiveSpan: (span: Span) => {
        const scope = getScopes().scope.clone();
        const isolationScope = getScopes().isolationScope;
        _INTERNAL_setSpanForScope(scope, span);
        return { scope, isolationScope };
      },
    }),
  });
}

/** A request whose response never finishes, so only `next()` ends the layer span. */
function createRequest(originalUrl: string): unknown {
  return { method: 'GET', originalUrl };
}

const RESPONSE = {
  once: () => undefined,
  removeListener: () => undefined,
};

/**
 * Drive one route-dispatch layer through the register and handle channels, the
 * way orchestrion's transform does, and return the span it opened.
 */
function handleRouteLayer(registeredPath: string, originalUrl: string): ReturnType<typeof spanToJSON> | undefined {
  // `bound dispatch` is the Express v4 route-dispatch layer, which maps to the
  // `request_handler` layer type.
  const layer = { name: 'bound dispatch', route: { path: registeredPath }, handle: { length: 3 } };

  tracingChannel(expressChannels.EXPRESS_REGISTER).traceSync(() => undefined, {
    self: { stack: [layer] },
    arguments: [registeredPath],
  });

  let json: ReturnType<typeof spanToJSON> | undefined;

  startSpan({ name: 'GET /' }, () => {
    tracingChannel(expressChannels.EXPRESS_HANDLE).traceSync(
      () => {
        const span = getActiveSpan();
        json = span ? spanToJSON(span) : undefined;
      },
      { self: layer, arguments: [createRequest(originalUrl), RESPONSE, () => undefined] },
    );
  });

  return json;
}

describe('instrumentExpress request handler span names', () => {
  // The subscriber captures the async-context strategy's ALS when it binds, and
  // `instrumentExpress` only subscribes once per module instance, so both happen
  // once for the file. Only the client varies per test.
  beforeAll(() => {
    installTestAsyncContextStrategy();
    instrumentExpress({}, tracingChannel);
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
  });

  afterEach(() => {
    // Keep the strategy the subscriber bound to; wiping it would strand its ALS.
    const acs = getAsyncContextStrategy(getMainCarrier());
    getMainCarrier().__SENTRY__ = undefined;
    setAsyncContextStrategy(acs);
  });

  it('names the span after the matched route when span streaming is enabled', () => {
    initTestClient();

    const json = handleRouteLayer('/users/:id', '/users/123');

    expect(json?.name).toBe('/users/:id');
    expect(json?.attributes).toMatchObject({
      'sentry.op': 'handler',
      'sentry.origin': 'auto.http.express',
      'http.route': '/users/:id',
      'express.type': 'request_handler',
    });
  });

  it('falls back to a static span name when the route does not match the url', () => {
    initTestClient();

    const json = handleRouteLayer('/users', '/other');

    expect(json?.name).toBe('Request handler');
    // The constructed route was not validated against the URL, so it is not the
    // span's `http.route` either.
    expect(json?.attributes['http.route']).toBeUndefined();
  });

  it('keeps the constructed route as the span name in static mode', () => {
    initTestClient({ traceLifecycle: 'static' });

    const json = handleRouteLayer('/users', '/other');

    expect(json?.name).toBe('/users');
  });
});
