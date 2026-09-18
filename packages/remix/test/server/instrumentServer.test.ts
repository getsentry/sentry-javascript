import type { LoaderFunctionArgs, ServerBuild } from '@remix-run/server-runtime';
import {
  CODE_FUNCTION_NAME,
  HTTP_ROUTE,
  ROUTER_NAVIGATION_ROUTE_ID,
  SENTRY_DESCRIPTION,
  SENTRY_OP,
} from '@sentry/conventions/attributes';
import { FUNCTION } from '@sentry/conventions/op';
import type { Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { instrumentBuild } from '../../src/server/instrumentServer';

describe('instrumentBuild', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets the matched route on the root span when the request handler is not wrapped', async () => {
    const rootSpan = {
      setAttribute: vi.fn(),
      updateName: vi.fn(),
    } as unknown as Span;
    vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue(rootSpan);
    vi.spyOn(SentryCore, 'getRootSpan').mockReturnValue(rootSpan);
    vi.spyOn(SentryCore, 'spanToJSON').mockReturnValue({ name: 'GET /users/42' });
    const build = {
      entry: { module: {} },
      routes: {
        root: {
          id: 'root',
          module: { loader: vi.fn(() => ({})) },
        },
        'routes/users.$id': {
          id: 'routes/users.$id',
          parentId: 'root',
          path: 'users/:id',
          module: {},
        },
      },
    } as unknown as ServerBuild;
    const instrumentedBuild = instrumentBuild(build, { instrumentTracing: true });

    await instrumentedBuild.routes.root?.module.loader?.({
      context: {},
      params: { id: '42' },
      request: new Request('https://example.com/users/42'),
    } as LoaderFunctionArgs);

    expect(rootSpan.setAttribute).toHaveBeenCalledWith(HTTP_ROUTE, '/users/:id');
  });

  describe('documentRequest span', () => {
    function instrumentDocumentRequest(): (request: Request) => Promise<Response> {
      const rootSpan = { setAttribute: vi.fn(), updateName: vi.fn() } as unknown as Span;
      vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue(rootSpan);
      vi.spyOn(SentryCore, 'getRootSpan').mockReturnValue(rootSpan);
      vi.spyOn(SentryCore, 'spanToJSON').mockReturnValue({ name: 'GET /users/:id' });

      const build = {
        entry: { module: { default: vi.fn(async () => new Response('ok')) } },
        routes: {},
      } as unknown as ServerBuild;

      return instrumentBuild(build, { instrumentTracing: true }).entry.module.default as never;
    }

    it.each([
      { lifecycle: 'streaming', streamed: true, expectedName: 'documentRequest' },
      { lifecycle: 'static', streamed: false, expectedName: 'GET /users/:id' },
    ])('names the span $expectedName with $lifecycle spans', async ({ streamed, expectedName }) => {
      vi.spyOn(SentryCore, 'getClient').mockReturnValue({} as never);
      vi.spyOn(SentryCore, 'hasSpanStreamingEnabled').mockReturnValue(streamed);
      const startSpan = vi
        .spyOn(SentryCore, 'startSpan')
        .mockImplementation((_options, callback) => callback(undefined as unknown as Span));

      await instrumentDocumentRequest()(new Request('https://example.com/users/42'));

      expect(startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expectedName,
          attributes: expect.objectContaining({
            [SENTRY_OP]: FUNCTION,
            // The description keeps the name the span had before it went low cardinality.
            [SENTRY_DESCRIPTION]: 'GET /users/:id',
            [CODE_FUNCTION_NAME]: 'documentRequest',
          }),
        }),
        expect.any(Function),
      );
    });
  });

  describe('loader and action spans', () => {
    function instrumentRouteLoader(): (args: LoaderFunctionArgs) => Promise<unknown> {
      const build = {
        entry: { module: {} },
        routes: {
          root: { id: 'root', module: {} },
          'routes/users.$id': {
            id: 'routes/users.$id',
            parentId: 'root',
            path: 'users/:id',
            module: { loader: vi.fn(async () => ({})) },
          },
        },
      } as unknown as ServerBuild;

      return instrumentBuild(build, { instrumentTracing: true }).routes['routes/users.$id']!.module.loader as never;
    }

    it.each([
      { lifecycle: 'streaming', streamed: true, expectedName: 'loader' },
      { lifecycle: 'static', streamed: false, expectedName: 'routes/users.$id' },
    ])('names the span $expectedName with $lifecycle spans', async ({ streamed, expectedName }) => {
      vi.spyOn(SentryCore, 'getClient').mockReturnValue({} as never);
      vi.spyOn(SentryCore, 'hasSpanStreamingEnabled').mockReturnValue(streamed);
      const startSpan = vi
        .spyOn(SentryCore, 'startSpan')
        .mockImplementation((_options, callback) => callback(undefined as unknown as Span));

      await instrumentRouteLoader()({
        context: {},
        params: { id: '42' },
        request: new Request('https://example.com/users/42'),
      } as LoaderFunctionArgs);

      expect(startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expectedName,
          attributes: expect.objectContaining({
            [SENTRY_OP]: FUNCTION,
            // The description keeps the name the span had before it went low cardinality.
            [SENTRY_DESCRIPTION]: 'routes/users.$id',
            [CODE_FUNCTION_NAME]: 'loader',
            // The route id left the span name, so it has to stay reachable as an attribute.
            [ROUTER_NAVIGATION_ROUTE_ID]: 'routes/users.$id',
          }),
        }),
        expect.any(Function),
      );
    });
  });
});
