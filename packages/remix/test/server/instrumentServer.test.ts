import type { LoaderFunctionArgs, ServerBuild } from '@remix-run/server-runtime';
import { HTTP_ROUTE } from '@sentry/conventions/attributes';
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
});
