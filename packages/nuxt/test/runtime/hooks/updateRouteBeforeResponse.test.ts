import {
  debug,
  getActiveSpan,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  type Span,
  type SpanAttributes,
} from '@sentry/core';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { updateRouteBeforeResponse } from '../../../src/runtime/hooks/updateRouteBeforeResponse';

vi.mock(import('@sentry/core'), async importOriginal => {
  const mod = await importOriginal();

  return {
    ...mod,
    debug: {
      ...mod.debug,
      log: vi.fn(),
    },
    getActiveSpan: vi.fn(),
    getRootSpan: vi.fn(),
  };
});

describe('updateRouteBeforeResponse', () => {
  const mockRootSpan = {
    setAttributes: vi.fn(),
  } as unknown as Pick<Span, 'setAttributes'>;

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('updates the transaction name for Nitro v2 matched routes', () => {
    (getActiveSpan as Mock).mockReturnValue({} as Span);
    (getRootSpan as Mock).mockReturnValue(mockRootSpan);

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

    expect(mockRootSpan.setAttributes).toHaveBeenCalledWith({
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
      'http.route': '/users/:id',
    } satisfies SpanAttributes);
    expect(mockRootSpan.setAttributes).toHaveBeenCalledWith({
      'params.id': '123',
      'url.path.parameter.id': '123',
    } satisfies SpanAttributes);
    expect(debug.log).toHaveBeenCalledWith('Updated transaction name for parametrized route: /users/:id');
  });

  it('updates the transaction name for Nitro v3 matched routes', () => {
    (getActiveSpan as Mock).mockReturnValue({} as Span);
    (getRootSpan as Mock).mockReturnValue(mockRootSpan);

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

    expect(mockRootSpan.setAttributes).toHaveBeenCalledWith({
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
      'http.route': '/users/:id',
    } satisfies SpanAttributes);
    expect(mockRootSpan.setAttributes).toHaveBeenCalledWith({
      'params.id': '123',
      'url.path.parameter.id': '123',
    } satisfies SpanAttributes);
  });
});
