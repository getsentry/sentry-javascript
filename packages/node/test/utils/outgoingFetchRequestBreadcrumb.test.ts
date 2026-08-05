import type { CollectBehavior } from '@sentry/core';
import { addBreadcrumb, getCurrentScope, withScope } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UndiciRequest, UndiciResponse } from '../../src/integrations/node-fetch/types';
import { addFetchRequestBreadcrumb } from '../../src/utils/outgoingFetchRequest';
import { NodeClient } from '../../src';
import { getDefaultNodeClientOptions } from '../helpers/getDefaultNodeClientOptions';

vi.mock('@sentry/core', async () => {
  const actual = (await vi.importActual('@sentry/core')) as Record<string, unknown>;
  return { ...actual, addBreadcrumb: vi.fn() };
});

function makeRequest(path: string): UndiciRequest {
  return { method: 'GET', origin: 'https://example.com', path, headers: {} } as unknown as UndiciRequest;
}

const RESPONSE = { statusCode: 200 } as unknown as UndiciResponse;

/**
 * Breadcrumbs never reach the span pipeline, so `addFetchRequestBreadcrumb` is the only place
 * `dataCollection.urlQueryParams` is applied to outgoing fetch breadcrumbs.
 */
describe('addFetchRequestBreadcrumb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function breadcrumbQuery(path: string, urlQueryParams?: CollectBehavior): unknown {
    const client = new NodeClient(
      getDefaultNodeClientOptions(urlQueryParams !== undefined ? { dataCollection: { urlQueryParams } } : {}),
    );

    return withScope(scope => {
      scope.setClient(client);
      getCurrentScope().setClient(client);
      addFetchRequestBreadcrumb(makeRequest(path), RESPONSE);

      const callArg = vi.mocked(addBreadcrumb).mock.calls.at(-1)![0];
      return callArg.data?.['url.query'];
    });
  }

  it('filters sensitive params and preserves encoding by default', () => {
    expect(breadcrumbQuery('/api?token=abc123&q=a%20b%26c&page=5')).toBe('token=[Filtered]&q=a%20b%26c&page=5');
  });

  it('omits the query entirely when collection is off', () => {
    expect(breadcrumbQuery('/api?token=abc123&page=5', false)).toBeUndefined();
  });

  it('honors allowList mode', () => {
    expect(breadcrumbQuery('/api?page=1&ref=x&sort=name', { allow: ['page', 'sort'] })).toBe(
      'page=1&ref=[Filtered]&sort=name',
    );
  });

  it('honors extra deny terms', () => {
    expect(breadcrumbQuery('/api?page=1&utm_source=email', { deny: ['utm'] })).toBe('page=1&utm_source=[Filtered]');
  });
});
