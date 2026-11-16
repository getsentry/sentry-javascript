import { HTTP_TARGET, SERVER_ADDRESS, URL_PATH } from '@sentry/conventions/attributes';
import { shouldIgnoreSpan } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dropMiddlewareTunnelRequests,
  getTunnelRouteIgnoreSpans,
} from '../../src/common/utils/dropMiddlewareTunnelRequests';
import { ATTR_NEXT_ROUTE, ATTR_NEXT_SPAN_TYPE } from '../../src/common/nextSpanAttributes';
import { TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION } from '../../src/common/span-attributes-with-logic-attached';

const served = vi.hoisted(() => ({ tunnel: undefined as { paths: string[]; basePath?: string } | undefined }));

vi.mock('@sentry/core/server', async requireActual => {
  return {
    ...(await requireActual<any>()),
    _INTERNAL_getServedTunnel: () => served.tunnel,
  };
});

function serveTunnel(paths: string[], basePath?: string): void {
  served.tunnel = { paths, basePath };
}

vi.mock('@sentry/core', async requireActual => {
  return {
    ...(await requireActual<any>()),
    getClient: () => ({
      getOptions: () => ({}),
    }),
  };
});

function createMockSpan(): { setAttribute: ReturnType<typeof vi.fn>; attributes: Record<string, unknown> } {
  const attributes: Record<string, unknown> = {};
  return {
    attributes,
    setAttribute: vi.fn((key: string, value: unknown) => {
      attributes[key] = value;
    }),
  };
}

beforeEach(() => {
  served.tunnel = undefined;
});

describe('dropMiddlewareTunnelRequests', () => {
  describe('BaseServer.handleRequest spans', () => {
    it('marks BaseServer.handleRequest span for dropping when http.target matches tunnel path', () => {
      serveTunnel(['/monitoring']);
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'BaseServer.handleRequest',
        'http.target': '/monitoring?o=123&p=456',
      });

      expect(span.setAttribute).toHaveBeenCalledWith(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
    });

    it('marks BaseServer.handleRequest span for dropping when http.target exactly matches tunnel path', () => {
      serveTunnel(['/monitoring']);
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'BaseServer.handleRequest',
        'http.target': '/monitoring',
      });

      expect(span.setAttribute).toHaveBeenCalledWith(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
    });

    it('does not mark BaseServer.handleRequest span for dropping when http.target does not match tunnel path', () => {
      serveTunnel(['/monitoring']);
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'BaseServer.handleRequest',
        'http.target': '/api/users',
      });

      expect(span.setAttribute).not.toHaveBeenCalled();
    });

    it('does not mark BaseServer.handleRequest span for dropping when http.target shares tunnel path prefix', () => {
      serveTunnel(['/monitoring']);
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'BaseServer.handleRequest',
        'http.target': '/monitoring-dashboard',
      });

      expect(span.setAttribute).not.toHaveBeenCalled();
    });

    it('does not mark BaseServer.handleRequest span when no tunnel path is configured', () => {
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'BaseServer.handleRequest',
        'http.target': '/monitoring',
      });

      expect(span.setAttribute).not.toHaveBeenCalled();
    });

    it('handles BaseServer.handleRequest span with basePath prefix in http.target', () => {
      serveTunnel(['/basepath/monitoring']);
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'BaseServer.handleRequest',
        'http.target': '/basepath/monitoring?o=123&p=456',
      });

      expect(span.setAttribute).toHaveBeenCalledWith(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
    });
  });

  describe('Middleware.execute spans', () => {
    it('marks middleware span for dropping when http.target matches tunnel path', () => {
      serveTunnel(['/monitoring']);
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'Middleware.execute',
        'http.target': '/monitoring?o=123&p=456',
      });

      expect(span.setAttribute).toHaveBeenCalledWith(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
    });
  });

  describe('Next.request spans', () => {
    it('marks the proxy root span for dropping when http.target matches tunnel path', () => {
      serveTunnel(['/monitoring']);
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'Next.request',
        'http.target': '/monitoring',
      });

      expect(span.setAttribute).toHaveBeenCalledWith(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
    });
  });

  describe('unrelated spans', () => {
    it('does not process spans without matching span type or origin', () => {
      serveTunnel(['/monitoring']);
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'SomeOtherSpanType',
        'http.target': '/monitoring',
      });

      expect(span.setAttribute).not.toHaveBeenCalled();
    });
  });

  describe('enableOpenTelemetrySetup', () => {
    it('does not process spans when enableOpenTelemetrySetup is false', async () => {
      const core = await import('@sentry/core');
      vi.spyOn(core, 'getClient').mockReturnValueOnce({
        getOptions: () => ({ enableOpenTelemetrySetup: false }),
      } as any);

      serveTunnel(['/monitoring']);
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'BaseServer.handleRequest',
        'http.target': '/monitoring',
      });

      expect(span.setAttribute).not.toHaveBeenCalled();

      vi.mocked(core.getClient).mockRestore();
    });
  });
});

describe('getTunnelRouteIgnoreSpans', () => {
  function isIgnored(attributes: Record<string, unknown>): boolean {
    return shouldIgnoreSpan(
      { description: 'POST', op: 'http.server', attributes },
      getTunnelRouteIgnoreSpans(undefined),
    );
  }

  // Next.js sets the deprecated `http.target` on its request spans.
  function nextRequestSpanAttributes(spanType: string, target: string): Record<string, unknown> {
    // eslint-disable-next-line typescript/no-deprecated
    return { [ATTR_NEXT_SPAN_TYPE]: spanType, [HTTP_TARGET]: target };
  }

  it('returns no entries when there is no tunnel route', () => {
    expect(getTunnelRouteIgnoreSpans(undefined)).toEqual([]);
  });

  it.each(['/docs/k3x9q2a', '/docs/k3x9q2a/', '/docs/f00ba7'])(
    'ignores a request span for the derived path %s',
    target => {
      serveTunnel(['/k3x9q2a', '/f00ba7'], '/docs');

      expect(isIgnored(nextRequestSpanAttributes('Middleware.execute', target))).toBe(true);
      expect(isIgnored(nextRequestSpanAttributes('Next.request', target))).toBe(true);
    },
  );

  it('does not ignore a request span for a derived path outside of the base path', () => {
    serveTunnel(['/k3x9q2a'], '/docs');

    expect(isIgnored(nextRequestSpanAttributes('Next.request', '/k3x9q2a'))).toBe(false);
  });

  it.each([
    ['BaseServer.handleRequest', '/monitoring'],
    ['BaseServer.handleRequest', '/monitoring/'],
    ['BaseServer.handleRequest', '/monitoring?cache=0'],
    ['Middleware.execute', '/monitoring'],
    ['Next.request', '/monitoring'],
    ['Next.request', '/monitoring/'],
  ])('ignores a %s span for %s', (spanType, target) => {
    serveTunnel(['/monitoring']);

    expect(isIgnored(nextRequestSpanAttributes(spanType, target))).toBe(true);
  });

  it.each(['/monitoring/dashboard', '/monitoring-dashboard', '/api/monitoring'])(
    'does not ignore a request span for %s',
    target => {
      serveTunnel(['/monitoring']);

      expect(isIgnored(nextRequestSpanAttributes('BaseServer.handleRequest', target))).toBe(false);
      expect(isIgnored(nextRequestSpanAttributes('Next.request', target))).toBe(false);
    },
  );

  it('does not ignore an outgoing request with the tunnel path', () => {
    serveTunnel(['/monitoring']);

    const outgoingRequestAttributes = {
      [URL_PATH]: '/monitoring',
      // eslint-disable-next-line typescript/no-deprecated
      [HTTP_TARGET]: '/monitoring',
      [SERVER_ADDRESS]: 'api.example.com',
    };

    expect(isIgnored(outgoingRequestAttributes)).toBe(false);
  });

  it.each(['/sentry-tunnel', '/sentry-tunnel/route'])(
    'ignores the route handler span with next.route %s',
    nextRoute => {
      serveTunnel(['/monitoring']);

      expect(
        isIgnored({ [ATTR_NEXT_SPAN_TYPE]: 'AppRouteRouteHandlers.runHandler', [ATTR_NEXT_ROUTE]: nextRoute }),
      ).toBe(true);
    },
  );

  it('escapes regex characters in the tunnel path', () => {
    serveTunnel(['/a.b']);

    expect(isIgnored(nextRequestSpanAttributes('BaseServer.handleRequest', '/axb'))).toBe(false);
  });
});
