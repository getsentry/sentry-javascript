import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dropMiddlewareTunnelRequests } from '../../src/common/utils/dropMiddlewareTunnelRequests';
import { TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION } from '../../src/common/span-attributes-with-logic-attached';

const globalWithInjectedValues = global as typeof global & {
  _sentryRewritesTunnelPath?: string;
};

vi.mock('@sentry/core', async requireActual => {
  return {
    ...(await requireActual<any>()),
    getClient: () => ({
      getOptions: () => ({}),
    }),
  };
});

vi.mock('@sentry/opentelemetry', () => ({
  isSentryRequestSpan: () => false,
}));

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
  globalWithInjectedValues._sentryRewritesTunnelPath = undefined;
});

describe('dropMiddlewareTunnelRequests', () => {
  describe('BaseServer.handleRequest spans', () => {
    it('marks BaseServer.handleRequest span for dropping when http.target matches tunnel path', () => {
      globalWithInjectedValues._sentryRewritesTunnelPath = '/monitoring';
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'BaseServer.handleRequest',
        'http.target': '/monitoring?o=123&p=456',
      });

      expect(span.setAttribute).toHaveBeenCalledWith(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
    });

    it('marks BaseServer.handleRequest span for dropping when http.target exactly matches tunnel path', () => {
      globalWithInjectedValues._sentryRewritesTunnelPath = '/monitoring';
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'BaseServer.handleRequest',
        'http.target': '/monitoring',
      });

      expect(span.setAttribute).toHaveBeenCalledWith(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
    });

    it('does not mark BaseServer.handleRequest span for dropping when http.target does not match tunnel path', () => {
      globalWithInjectedValues._sentryRewritesTunnelPath = '/monitoring';
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'BaseServer.handleRequest',
        'http.target': '/api/users',
      });

      expect(span.setAttribute).not.toHaveBeenCalled();
    });

    it('does not mark BaseServer.handleRequest span for dropping when http.target shares tunnel path prefix', () => {
      globalWithInjectedValues._sentryRewritesTunnelPath = '/monitoring';
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
      globalWithInjectedValues._sentryRewritesTunnelPath = '/basepath/monitoring';
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
      globalWithInjectedValues._sentryRewritesTunnelPath = '/monitoring';
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'Middleware.execute',
        'http.target': '/monitoring?o=123&p=456',
      });

      expect(span.setAttribute).toHaveBeenCalledWith(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
    });
  });

  describe('unrelated spans', () => {
    it('does not process spans without matching span type or origin', () => {
      globalWithInjectedValues._sentryRewritesTunnelPath = '/monitoring';
      const span = createMockSpan();

      dropMiddlewareTunnelRequests(span as any, {
        'next.span_type': 'SomeOtherSpanType',
        'http.target': '/monitoring',
      });

      expect(span.setAttribute).not.toHaveBeenCalled();
    });
  });

  describe('skipOpenTelemetrySetup', () => {
    it('does not process spans when skipOpenTelemetrySetup is true', async () => {
      const core = await import('@sentry/core');
      const originalGetClient = core.getClient;
      vi.spyOn(core, 'getClient').mockReturnValueOnce({
        getOptions: () => ({ skipOpenTelemetrySetup: true }),
      } as any);

      globalWithInjectedValues._sentryRewritesTunnelPath = '/monitoring';
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
