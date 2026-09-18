import { describe, expect, it } from 'vitest';
import { withScope } from '../../../../src/currentScopes';
import type { CollectBehavior } from '../../../../src/types/datacollection';
import { filterCollectedUrl, filterCollectedUrlQuery } from '../../../../src/utils/data-collection/filterCollectedUrl';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

function withUrlQueryParams<T>(urlQueryParams: CollectBehavior | undefined, fn: () => T): T {
  const client = new TestClient(
    getDefaultTestClientOptions({
      dsn: 'https://dsn@ingest.f00.f00/1',
      ...(urlQueryParams !== undefined ? { dataCollection: { urlQueryParams } } : {}),
    }),
  );

  return withScope(scope => {
    scope.setClient(client);
    return fn();
  });
}

describe('filterCollectedUrl', () => {
  it('filters sensitive params and preserves encoding by default', () => {
    const result = withUrlQueryParams(undefined, () =>
      filterCollectedUrl('https://example.com/api/users?token=abc123&q=a%20b%26c&page=5'),
    );

    expect(result).toBe('https://example.com/api/users?token=[Filtered]&q=a%20b%26c&page=5');
  });

  it('strips the query entirely when collection is off', () => {
    const result = withUrlQueryParams(false, () => filterCollectedUrl('https://example.com/api?token=abc&page=5'));

    expect(result).toBe('https://example.com/api');
  });

  it('honors allowList mode', () => {
    const result = withUrlQueryParams({ allow: ['page'] }, () =>
      filterCollectedUrl('https://example.com/s?page=1&ref=x'),
    );

    expect(result).toBe('https://example.com/s?page=1&ref=[Filtered]');
  });

  it('leaves a URL without a query untouched', () => {
    expect(withUrlQueryParams(undefined, () => filterCollectedUrl('https://example.com/api'))).toBe(
      'https://example.com/api',
    );
  });

  it('passes `undefined` through', () => {
    expect(withUrlQueryParams(undefined, () => filterCollectedUrl(undefined))).toBeUndefined();
  });

  it('falls back to the denylist when no client is set', () => {
    expect(filterCollectedUrl('https://example.com/api?token=abc&page=5')).toBe(
      'https://example.com/api?token=[Filtered]&page=5',
    );
  });

  // The scope's client is the wrong one in a multi-client setup, so an explicitly passed client wins.
  it('prefers the passed client over the one on the scope', () => {
    const passedClient = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        dataCollection: { urlQueryParams: false },
      }),
    );

    const result = withUrlQueryParams(true, () =>
      filterCollectedUrl('https://example.com/api?token=abc&page=5', passedClient),
    );

    expect(result).toBe('https://example.com/api');
  });

  it('passes the client through in `filterCollectedUrlQuery` too', () => {
    const passedClient = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://dsn@ingest.f00.f00/1',
        dataCollection: { urlQueryParams: { allow: ['page'] } },
      }),
    );

    const result = withUrlQueryParams(true, () => filterCollectedUrlQuery('page=1&ref=x', passedClient));

    expect(result).toBe('page=1&ref=[Filtered]');
  });
});

describe('filterCollectedUrlQuery', () => {
  it('filters sensitive params by default', () => {
    expect(withUrlQueryParams(undefined, () => filterCollectedUrlQuery('token=abc&page=5'))).toBe(
      'token=[Filtered]&page=5',
    );
  });

  it('returns undefined when collection is off', () => {
    expect(withUrlQueryParams(false, () => filterCollectedUrlQuery('token=abc'))).toBeUndefined();
  });

  it('returns undefined for an empty or missing query', () => {
    expect(withUrlQueryParams(undefined, () => filterCollectedUrlQuery(''))).toBeUndefined();
    expect(withUrlQueryParams(undefined, () => filterCollectedUrlQuery(undefined))).toBeUndefined();
  });

  it('honors extra deny terms', () => {
    expect(withUrlQueryParams({ deny: ['utm'] }, () => filterCollectedUrlQuery('page=1&utm_source=email'))).toBe(
      'page=1&utm_source=[Filtered]',
    );
  });
});
