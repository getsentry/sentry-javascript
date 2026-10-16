import type { Event } from '@sentry/core';
import { requestDataIntegration, withScope } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { describe, expect, it } from 'vitest';
import { captureRequestError } from '../../src/common/captureRequestError';

describe('captureRequestError', () => {
  it('omits the query from the request context when query collection is disabled', async () => {
    const events: Event[] = [];
    const client = new NodeClient({
      dsn: 'https://public@example.com/1',
      integrations: [requestDataIntegration()],
      stackParser: () => [],
      transport: () => ({ send: async () => ({}), flush: async () => true }),
      dataCollection: { urlQueryParams: false },
      beforeSend: event => {
        events.push(event);
        return null;
      },
    });
    client.init();

    await withScope(async scope => {
      scope.setClient(client);
      captureRequestError(
        new Error('Search failed'),
        { path: '/search?token=secret&category=books', method: 'GET', headers: {} },
        { routerKind: 'App Router', routePath: '/search', routeType: 'render' },
      );
      await client.flush();
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.contexts?.nextjs).toEqual({
      request_path: '/search',
      router_kind: 'App Router',
      router_path: '/search',
      route_type: 'render',
    });
  });
});
