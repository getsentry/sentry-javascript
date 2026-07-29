import {
  getActiveSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SentrySpan,
} from '@sentry/core';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { updateRouteBeforeResponse } from '../../../src/runtime/hooks/updateRouteBeforeResponse';

vi.mock(import('@sentry/core'), async importOriginal => {
  const mod = await importOriginal();

  return {
    ...mod,
    getActiveSpan: vi.fn(),
  };
});

describe('updateRouteBeforeResponse', () => {
  const mockRootSpan = new SentrySpan({
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
    },
  });
  mockRootSpan.updateName = vi.fn();
  mockRootSpan.setAttribute = vi.fn();

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('updates the transaction name for Nitro v2 matched routes', () => {
    (getActiveSpan as Mock).mockReturnValue(mockRootSpan);

    updateRouteBeforeResponse({
      _path: '/users/123',
      context: {
        matchedRoute: {
          path: '/users/:id',
        },
        params: {
          id: '123',
        },
      },
    } as never);

    expect(mockRootSpan.setAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    expect(mockRootSpan.setAttribute).toHaveBeenCalledWith('http.route', '/users/:id');
    expect(mockRootSpan.setAttribute).toHaveBeenCalledWith('params.id', '123');
    expect(mockRootSpan.setAttribute).toHaveBeenCalledWith('url.path.parameter.id', '123');
    expect(mockRootSpan.updateName).toHaveBeenCalledWith('GET /users/:id');
  });

  it('updates the transaction name for Nitro v3 matched routes', () => {
    (getActiveSpan as Mock).mockReturnValue(mockRootSpan);

    updateRouteBeforeResponse({
      path: '/users/123',
      context: {
        matchedRoute: {
          route: '/users/:id',
        },
        params: {
          id: '123',
        },
      },
    } as never);

    expect(mockRootSpan.setAttribute).toHaveBeenCalledWith(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    expect(mockRootSpan.setAttribute).toHaveBeenCalledWith('http.route', '/users/:id');
    expect(mockRootSpan.setAttribute).toHaveBeenCalledWith('params.id', '123');
    expect(mockRootSpan.setAttribute).toHaveBeenCalledWith('url.path.parameter.id', '123');
    expect(mockRootSpan.updateName).toHaveBeenCalledWith('GET /users/:id');
  });
});
