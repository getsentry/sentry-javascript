import type { HandlerDataXhr, SentryWrappedXMLHttpRequest } from '@sentry/types';

import { handleXhr } from '../../../src/coreHandlers/handleXhr';

const DEFAULT_DATA: HandlerDataXhr = {
  args: ['GET', '/api/0/organizations/sentry/'],
  xhr: {
    __sentry_xhr__: {
      method: 'GET',
      url: '/api/0/organizations/sentry/',
      status_code: 200,
    },
  } as SentryWrappedXMLHttpRequest,
  startTimestamp: 10000,
  endTimestamp: 15000,
};

describe('Unit | coreHandlers | handleXhr', () => {
  it('formats fetch calls from core SDK to replay breadcrumbs', function () {
    expect(handleXhr(DEFAULT_DATA)).toEqual({
      type: 'resource.xhr',
      name: '/api/0/organizations/sentry/',
      start: 10,
      end: 15,
      data: {
        method: 'GET',
        statusCode: 200,
      },
    });
  });

  it('ignores xhr that have not completed yet', function () {
    const data = {
      ...DEFAULT_DATA,
      endTimestamp: undefined,
    };

    expect(handleXhr(data)).toEqual(null);
  });

  it('passes request/response size through if available', function () {
    const data: HandlerDataXhr = {
      ...DEFAULT_DATA,
      xhr: {
        ...DEFAULT_DATA.xhr,
        __sentry_xhr__: {
          ...DEFAULT_DATA.xhr.__sentry_xhr__,
          request_body_size: 123,
          response_body_size: 456,
        },
      },
    };

    expect(handleXhr(data)?.data).toEqual({
      method: 'GET',
      statusCode: 200,
      requestBodySize: 123,
      responseBodySize: 456,
    });
  });
});
