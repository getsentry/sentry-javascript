import { tracingChannel } from 'node:diagnostics_channel';
import type { Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import {
  makeRequest,
  makeSpan,
  setupRemixInstrumentation,
  teardownTestAsyncContextStrategy,
} from './tracing-channel-test-utils';
import { remixChannels } from '@sentry/server-utils/orchestrion';

describe('remixIntegration (Orchestrion-based)', () => {
  let startInactiveSpanSpy: MockInstance;
  let getActiveSpanSpy: MockInstance;
  let span: Span;

  beforeAll(() => {
    // Configure form-data capture so the ACTION span also extracts the mapped keys.
    setupRemixInstrumentation({ _action: 'actionType' });
  });

  afterAll(() => {
    teardownTestAsyncContextStrategy();
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

    await tracingChannel(remixChannels.REMIX_REQUEST_HANDLER).tracePromise(async () => ({ status: 200 }), ctx);

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

    tracingChannel(remixChannels.REMIX_MATCH_SERVER_ROUTES).traceSync(() => ctx.result, ctx);

    expect(span.setAttribute).toHaveBeenCalledWith('http.route', 'users/:userId');
    expect(span.setAttribute).toHaveBeenCalledWith('match.route.id', 'routes/users.$userId');
    expect(span.updateName).toHaveBeenCalledWith('remix.request users/:userId');
  });

  it('matchServerRoutes: does nothing when there is no active span', () => {
    getActiveSpanSpy.mockReturnValue(undefined);
    const ctx = { arguments: [], result: [{ route: { path: 'users/:userId', id: 'x' } }] };

    tracingChannel(remixChannels.REMIX_MATCH_SERVER_ROUTES).traceSync(() => ctx.result, ctx);

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

    await tracingChannel(remixChannels.REMIX_CALL_ROUTE_LOADER).tracePromise(async () => ({ status: 200 }), ctx);

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

    await tracingChannel(remixChannels.REMIX_CALL_ROUTE_LOADER).tracePromise(async () => ({ status: 200 }), ctx);

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

    await tracingChannel(remixChannels.REMIX_CALL_ROUTE_ACTION).tracePromise(async () => ({ status: 201 }), ctx);

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
