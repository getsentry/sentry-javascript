import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  setAsyncContextStrategy,
} from '@sentry/core';
import * as SentryNode from '@sentry/node';
import type { NodeClient } from '@sentry/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { remixChannelIntegration } from '../../src/server/integrations/tracing-channel';

const CHANNELS = {
  REQUEST_HANDLER: 'orchestrion:@remix-run/server-runtime:requestHandler',
  MATCH_SERVER_ROUTES: 'orchestrion:@remix-run/server-runtime:matchServerRoutes',
  CALL_ROUTE_LOADER: 'orchestrion:@remix-run/server-runtime:callRouteLoader',
  CALL_ROUTE_ACTION: 'orchestrion:@remix-run/server-runtime:callRouteAction',
} as const;

interface TestStore {
  scope: Scope;
  isolationScope: Scope;
}

// `bindTracingChannelToSpan` only binds (and `setupOnce` only subscribes via
// `waitForTracingChannelBinding`) when an async-context strategy exposes a
// `getTracingChannelBinding`. Install a minimal one so the channel subscriptions
// actually register in this unit-test context (no SDK `init`).
function installTestAsyncContextStrategy(): void {
  const asyncStorage = new AsyncLocalStorage<TestStore>();

  function getScopes(): TestStore {
    return asyncStorage.getStore() || { scope: getDefaultCurrentScope(), isolationScope: getDefaultIsolationScope() };
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

function makeSpan(): Span {
  return {
    end: vi.fn(),
    setStatus: vi.fn(),
    setAttributes: vi.fn(),
    setAttribute: vi.fn(),
    updateName: vi.fn(),
  } as unknown as Span;
}

function makeRequest(overrides: { method?: string; url?: string; formEntries?: Record<string, string> } = {}): Request {
  const { method = 'GET', url = 'http://localhost/test', formEntries } = overrides;
  return {
    method,
    url,
    clone: () => ({
      formData: async () => {
        const fd = new FormData();
        for (const [key, value] of Object.entries(formEntries ?? {})) {
          fd.append(key, value);
        }
        return fd;
      },
    }),
  } as unknown as Request;
}

describe('remixChannelIntegration', () => {
  let startInactiveSpanSpy: MockInstance;
  let getActiveSpanSpy: MockInstance;
  let span: Span;

  beforeAll(() => {
    installTestAsyncContextStrategy();
    // `setupOnce` reads form-data options off the client; provide one so the action subscription
    // (which is gated on `captureActionFormDataKeys`) is installed.
    vi.spyOn(SentryNode, 'getClient').mockReturnValue({
      getOptions: () => ({ captureActionFormDataKeys: { _action: 'actionType' } }),
      getDataCollectionOptions: () => ({ httpBodies: ['incomingRequest'] }),
    } as unknown as NodeClient);

    remixChannelIntegration().setupOnce?.();
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    span = makeSpan();
    startInactiveSpanSpy = vi.spyOn(SentryCore, 'startInactiveSpan').mockReturnValue(span);
    // A truthy active span by default, so the `requiresParentSpan` gate passes.
    getActiveSpanSpy = vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue({} as Span);
  });

  afterEach(() => {
    startInactiveSpanSpy.mockRestore();
    getActiveSpanSpy.mockRestore();
  });

  it('requestHandler: builds the http.server span and sets the response status', async () => {
    const ctx = { arguments: [makeRequest({ method: 'GET', url: 'http://localhost/users' })] };

    await tracingChannel(CHANNELS.REQUEST_HANDLER).tracePromise(async () => ({ status: 200 }), ctx);

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'remix.request',
        kind: SentryCore.SPAN_KIND.SERVER,
        attributes: expect.objectContaining({
          'sentry.origin': 'auto.http.orchestrion.remix',
          'sentry.op': 'http.server',
          'code.function': 'requestHandler',
          'http.method': 'GET',
          'http.url': 'http://localhost/users',
        }),
      }),
    );
    expect(span.setAttribute).toHaveBeenCalledWith('http.status_code', 200);
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('matchServerRoutes: enriches the active request span with the matched route', () => {
    getActiveSpanSpy.mockReturnValue(span);
    const ctx = {
      arguments: [[], '/users/123'],
      result: [{ route: { path: 'users/:userId', id: 'routes/users.$userId' } }],
    };

    tracingChannel(CHANNELS.MATCH_SERVER_ROUTES).traceSync(() => ctx.result, ctx);

    expect(span.setAttribute).toHaveBeenCalledWith('http.route', 'users/:userId');
    expect(span.setAttribute).toHaveBeenCalledWith('match.route.id', 'routes/users.$userId');
    expect(span.updateName).toHaveBeenCalledWith('remix.request users/:userId');
  });

  it('matchServerRoutes: does nothing when there is no active span', () => {
    getActiveSpanSpy.mockReturnValue(undefined);
    const ctx = { arguments: [], result: [{ route: { path: 'users/:userId', id: 'x' } }] };

    tracingChannel(CHANNELS.MATCH_SERVER_ROUTES).traceSync(() => ctx.result, ctx);

    expect(span.setAttribute).not.toHaveBeenCalled();
  });

  it('callRouteLoader: builds a LOADER span with request + match attributes', async () => {
    const ctx = {
      arguments: [
        {
          routeId: 'routes/users.$userId',
          request: makeRequest({ method: 'GET', url: 'http://localhost/users/123' }),
          params: { userId: '123' },
        },
      ],
    };

    await tracingChannel(CHANNELS.CALL_ROUTE_LOADER).tracePromise(async () => ({ status: 200 }), ctx);

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'LOADER routes/users.$userId',
        attributes: expect.objectContaining({
          'sentry.origin': 'auto.http.orchestrion.remix',
          'sentry.op': 'loader.remix',
          'code.function': 'loader',
          'http.method': 'GET',
          'http.url': 'http://localhost/users/123',
          'match.route.id': 'routes/users.$userId',
          'match.params.userId': '123',
        }),
      }),
    );
    expect(span.setAttribute).toHaveBeenCalledWith('http.status_code', 200);
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('callRouteLoader: does not create a span without an active parent span', async () => {
    getActiveSpanSpy.mockReturnValue(undefined);
    const ctx = { arguments: [{ routeId: 'x', request: makeRequest(), params: {} }] };

    await tracingChannel(CHANNELS.CALL_ROUTE_LOADER).tracePromise(async () => ({ status: 200 }), ctx);

    expect(startInactiveSpanSpy).not.toHaveBeenCalled();
  });

  it('callRouteAction: builds an ACTION span and captures the configured form-data keys', async () => {
    const ctx = {
      arguments: [
        {
          routeId: 'routes/submit',
          request: makeRequest({ method: 'POST', url: 'http://localhost/submit', formEntries: { _action: 'create' } }),
          params: {},
        },
      ],
    };

    await tracingChannel(CHANNELS.CALL_ROUTE_ACTION).tracePromise(async () => ({ status: 201 }), ctx);

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ACTION routes/submit',
        attributes: expect.objectContaining({
          'sentry.op': 'action.remix',
          'code.function': 'action',
          'http.method': 'POST',
        }),
      }),
    );
    // The span ends only after the async form-data read resolves.
    await vi.waitFor(() => expect(span.end).toHaveBeenCalledTimes(1));
    expect(span.setAttribute).toHaveBeenCalledWith('http.status_code', 201);
    expect(span.setAttribute).toHaveBeenCalledWith('formData.actionType', 'create');
  });
});
