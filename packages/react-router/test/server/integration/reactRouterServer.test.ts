import type { Event } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReactRouterInstrumentation } from '../../../src/server/instrumentation/reactRouter';
import { reactRouterServerIntegration } from '../../../src/server/integration/reactRouterServer';

vi.mock('../../../src/server/instrumentation/reactRouter', () => {
  return {
    ReactRouterInstrumentation: vi.fn(),
  };
});

vi.mock('@sentry/node', () => {
  return {
    generateInstrumentOnce: vi.fn((_name: string, callback: () => any) => {
      return Object.assign(callback, { id: 'test' });
    }),
  };
});

describe('reactRouterServerIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets up ReactRouterInstrumentation on setupOnce', () => {
    const integration = reactRouterServerIntegration();
    integration.setupOnce!();

    expect(ReactRouterInstrumentation).toHaveBeenCalled();
  });

  it('always sets up ReactRouterInstrumentation to capture ServerBuild for middleware name resolution', () => {
    // The instrumentation is always installed to capture the ServerBuild reference,
    // which is needed for middleware name resolution. The OTEL wrapper internally
    // skips creating loader/action spans when the instrumentation API is active.
    const integration = reactRouterServerIntegration();
    integration.setupOnce!();

    expect(ReactRouterInstrumentation).toHaveBeenCalledTimes(1);
  });

  it('has processEvent that removes bogus http.route attribute', () => {
    const integration = reactRouterServerIntegration();

    // Test with bogus * route and non-* transaction name
    const event1 = {
      type: 'transaction' as const,
      contexts: {
        trace: {
          span_id: 'test-span-id',
          trace_id: 'test-trace-id',
          data: {
            'http.route': '*',
          },
        },
      },
      transaction: 'GET /users',
    } as Event;

    const result1 = integration.processEvent!(event1, {}, {} as any) as Event | null;
    expect(result1?.contexts?.trace?.data?.['http.route']).toBeUndefined();

    // Test with bogus * route but GET * transaction name (should keep)
    const event2 = {
      type: 'transaction' as const,
      contexts: {
        trace: {
          span_id: 'test-span-id',
          trace_id: 'test-trace-id',
          data: {
            'http.route': '*',
          },
        },
      },
      transaction: 'GET *',
    } as Event;

    const result2 = integration.processEvent!(event2, {}, {} as any) as Event | null;
    expect(result2?.contexts?.trace?.data?.['http.route']).toBe('*');

    // Test with instrumentation_api origin (should always remove)
    const event3 = {
      type: 'transaction' as const,
      contexts: {
        trace: {
          span_id: 'test-span-id',
          trace_id: 'test-trace-id',
          origin: 'auto.http.react_router.instrumentation_api',
          data: {
            'http.route': '*',
          },
        },
      },
      transaction: 'GET *',
    } as Event;

    const result3 = integration.processEvent!(event3, {}, {} as any) as Event | null;
    expect(result3?.contexts?.trace?.data?.['http.route']).toBeUndefined();
  });
});
