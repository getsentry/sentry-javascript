import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dropMiddlewareTunnelRequests } from '../../src/common/utils/dropMiddlewareTunnelRequests';
import { TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION } from '../../src/common/span-attributes-with-logic-attached';

let managedTunnel: { basePath: string; path?: string } | undefined;

vi.mock('@sentry/core', async requireActual => {
  return {
    ...(await requireActual<any>()),
    getClient: () => ({
      getOptions: () => ({ _managedTunnel: managedTunnel }),
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
  managedTunnel = undefined;
});

describe('dropMiddlewareTunnelRequests', () => {
  describe('BaseServer.handleRequest spans', () => {
    it('marks BaseServer.handleRequest span for dropping when http.target matches tunnel path', () => {
      managedTunnel = { basePath: '', path: '/monitoring' };
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'BaseServer.handleRequest',
        'http.target': '/monitoring?o=123',
      });

      expect(span.setAttribute).toHaveBeenCalledWith(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
    });

    it('marks BaseServer.handleRequest span for dropping when http.target exactly matches tunnel path', () => {
      managedTunnel = { basePath: '', path: '/monitoring' };
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'BaseServer.handleRequest',
        'http.target': '/monitoring',
      });

      expect(span.setAttribute).toHaveBeenCalledWith(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
    });

    it('does not mark BaseServer.handleRequest span for dropping when http.target does not match tunnel path', () => {
      managedTunnel = { basePath: '', path: '/monitoring' };
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'BaseServer.handleRequest',
        'http.target': '/api/users',
      });

      expect(span.setAttribute).not.toHaveBeenCalled();
    });

    it('marks the span of the tunnel route the rewrite points at', () => {
      managedTunnel = { basePath: '' };
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'BaseServer.handleRequest',
        'http.target': '/sentry-tunnel?p=abc123',
      });

      expect(span.setAttribute).toHaveBeenCalledWith(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
    });

    it('does not mark BaseServer.handleRequest span for dropping when http.target shares tunnel path prefix', () => {
      managedTunnel = { basePath: '', path: '/monitoring' };
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
      managedTunnel = { basePath: '/basepath', path: '/monitoring' };
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'BaseServer.handleRequest',
        'http.target': '/basepath/monitoring',
      });

      expect(span.setAttribute).toHaveBeenCalledWith(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
    });
  });

  describe('Middleware.execute spans', () => {
    it('marks middleware span for dropping when http.target matches tunnel path', () => {
      managedTunnel = { basePath: '', path: '/monitoring' };
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'Middleware.execute',
        'http.target': '/monitoring?o=123',
      });

      expect(span.setAttribute).toHaveBeenCalledWith(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
    });
  });

  describe('unrelated spans', () => {
    it('does not process spans without matching span type or origin', () => {
      managedTunnel = { basePath: '', path: '/monitoring' };
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

      managedTunnel = { basePath: '', path: '/monitoring' };
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
