import type { HandlerDataFetch } from '@sentry/types';

import { handleFetch } from '../../../src/coreHandlers/handleFetch';

const DEFAULT_DATA: HandlerDataFetch = {
  args: ['/api/0/organizations/sentry/', { method: 'GET', headers: {}, credentials: 'include' }] as Parameters<
    typeof fetch
  >,
  endTimestamp: 15000,
  fetchData: {
    method: 'GET',
    url: '/api/0/organizations/sentry/',
  },
  response: {
    type: 'basic',
    url: '',
    redirected: false,
    status: 200,
    ok: true,
  } as Response,
  startTimestamp: 10000,
};

describe('Unit | coreHandlers | handleFetch', () => {
  it('formats fetch calls from core SDK to replay breadcrumbs', function () {
    expect(handleFetch(DEFAULT_DATA)).toEqual({
      type: 'resource.fetch',
      name: '/api/0/organizations/sentry/',
      start: 10,
      end: 15,
      data: {
        method: 'GET',
        statusCode: 200,
      },
    });
  });

  it('ignores fetches that have not completed yet', function () {
    const data = {
      ...DEFAULT_DATA,
      endTimestamp: undefined,
      response: undefined,
    };

    expect(handleFetch(data)).toEqual(null);
  });

  // This cannot happen as of now, this test just shows the expected behavior
  it('ignores request/response sizes', function () {
    const data = {
      ...DEFAULT_DATA,
      fetchData: {
        ...DEFAULT_DATA.fetchData,
        request_body_size: 123,
        response_body_size: 456,
      },
    };

    expect(handleFetch(data)?.data).toEqual({
      method: 'GET',
      statusCode: 200,
    });
  });
});
