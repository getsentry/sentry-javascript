import { SENTRY_XHR_DATA_KEY } from '@sentry-internal/browser-utils';
import type {
  Breadcrumb,
  BreadcrumbHint,
  FetchBreadcrumbHint,
  SentryWrappedXMLHttpRequest,
  XhrBreadcrumbHint,
} from '@sentry/types';

import { BASE_TIMESTAMP } from '../..';
import { NETWORK_BODY_MAX_SIZE } from '../../../src/constants';
import { beforeAddNetworkBreadcrumb } from '../../../src/coreHandlers/handleNetworkBreadcrumbs';
import type { EventBufferArray } from '../../../src/eventBuffer/EventBufferArray';
import type { ReplayContainer, ReplayNetworkOptions } from '../../../src/types';
import { setupReplayContainer } from '../../utils/setupReplayContainer';

jest.useFakeTimers();

async function waitForReplayEventBuffer() {
  // Need one Promise.resolve() per await in the util functions
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const LARGE_BODY = 'a'.repeat(NETWORK_BODY_MAX_SIZE + 1);

function getMockResponse(contentLength?: string, body?: string, headers?: Record<string, string>): Response {
  const internalHeaders: Record<string, string> = {
    ...(contentLength !== undefined ? { 'content-length': `${contentLength}` } : {}),
    ...headers,
  };

  const response = {
    headers: {
      has: (prop: string) => {
        return !!internalHeaders[prop?.toLowerCase() ?? ''];
      },
      get: (prop: string) => {
        return internalHeaders[prop?.toLowerCase() ?? ''];
      },
    },
    clone: () => response,
    text: () => Promise.resolve(body),
  } as unknown as Response;

  return response;
}

describe('Unit | coreHandlers | handleNetworkBreadcrumbs', () => {
  describe('beforeAddNetworkBreadcrumb()', () => {
    let options: ReplayNetworkOptions & {
      replay: ReplayContainer;
    };

    beforeEach(() => {
      jest.setSystemTime(BASE_TIMESTAMP);

      options = {
        replay: setupReplayContainer(),
        networkDetailAllowUrls: ['https://example.com'],
        networkDetailDenyUrls: ['http://localhost:8080'],
        networkCaptureBodies: false,
        networkRequestHeaders: ['content-type', 'accept', 'x-custom-header'],
        networkResponseHeaders: ['content-type', 'accept', 'x-custom-header'],
      };

      jest.runAllTimers();
    });

    it('ignores breadcrumb without data', async () => {
      const breadcrumb: Breadcrumb = {};
      const hint: BreadcrumbHint = {};
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({});

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([]);
    });

    it('ignores non-network breadcrumbs', async () => {
      const breadcrumb: Breadcrumb = {
        category: 'foo',
        data: {},
      };
      const hint: BreadcrumbHint = {};
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'foo',
        data: {},
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([]);
    });

    it('handles full xhr breadcrumb', async () => {
      const breadcrumb: Breadcrumb = {
        category: 'xhr',
        data: {
          method: 'GET',
          url: 'https://example.com',
          status_code: 200,
        },
      };
      const xhr = new XMLHttpRequest() as XMLHttpRequest & SentryWrappedXMLHttpRequest;
      Object.defineProperty(xhr, 'response', {
        value: 'test response',
      });
      xhr[SENTRY_XHR_DATA_KEY] = {
        method: 'GET',
        url: 'https://example.com',
        request_headers: {
          'content-type': 'text/plain',
          'other-header': 'test',
        },
      };
      xhr.getAllResponseHeaders = () => `content-type: application/json\r
accept: application/json\r
other-header: test`;
      const hint: XhrBreadcrumbHint = {
        xhr,
        input: 'test input',
        startTimestamp: BASE_TIMESTAMP + 1000,
        endTimestamp: BASE_TIMESTAMP + 2000,
      };
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'xhr',
        data: {
          method: 'GET',
          request_body_size: 10,
          response_body_size: 13,
          status_code: 200,
          url: 'https://example.com',
        },
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                method: 'GET',
                statusCode: 200,
                request: {
                  size: 10,
                  headers: {
                    'content-type': 'text/plain',
                  },
                },
                response: {
                  size: 13,
                  headers: {
                    accept: 'application/json',
                    'content-type': 'application/json',
                  },
                },
              },
              description: 'https://example.com',
              endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
              op: 'resource.xhr',
              startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
            },
          },
        },
      ]);
    });

    it('handles minimal xhr breadcrumb', async () => {
      const breadcrumb: Breadcrumb = {
        category: 'xhr',
        data: {
          url: 'https://example.com',
          status_code: 200,
        },
      };
      const xhr = new XMLHttpRequest();

      const hint: XhrBreadcrumbHint = {
        xhr,
        input: undefined,
        startTimestamp: BASE_TIMESTAMP + 1000,
        endTimestamp: BASE_TIMESTAMP + 2000,
      };
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'xhr',
        data: {
          status_code: 200,
          url: 'https://example.com',
        },
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                statusCode: 200,
              },
              description: 'https://example.com',
              endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
              op: 'resource.xhr',
              startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
            },
          },
        },
      ]);
    });

    it('handles full fetch breadcrumb', async () => {
      const breadcrumb: Breadcrumb = {
        category: 'fetch',
        data: {
          method: 'GET',
          url: 'https://example.com',
          status_code: 200,
        },
      };

      const mockResponse = getMockResponse('13', undefined, {
        'content-type': 'application/json',
        accept: 'application/json',
        'other-header': 'test',
      });

      const hint: FetchBreadcrumbHint = {
        input: [
          'GET',
          { body: 'test input', headers: { 'content-type': 'text/plain', other: 'header here', accept: 'text/plain' } },
        ],
        response: mockResponse,
        startTimestamp: BASE_TIMESTAMP + 1000,
        endTimestamp: BASE_TIMESTAMP + 2000,
      };
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'fetch',
        data: {
          method: 'GET',
          request_body_size: 10,
          response_body_size: 13,
          status_code: 200,
          url: 'https://example.com',
        },
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                method: 'GET',
                request: {
                  size: 10,
                  headers: {
                    'content-type': 'text/plain',
                    accept: 'text/plain',
                  },
                },
                response: {
                  size: 13,
                  headers: {
                    'content-type': 'application/json',
                    accept: 'application/json',
                  },
                },
                statusCode: 200,
              },
              description: 'https://example.com',
              endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
              op: 'resource.fetch',
              startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
            },
          },
        },
      ]);
    });

    it('handles minimal fetch breadcrumb', async () => {
      const breadcrumb: Breadcrumb = {
        category: 'fetch',
        data: {
          url: 'https://example.com',
          status_code: 200,
        },
      };

      const mockResponse = getMockResponse();

      const hint: FetchBreadcrumbHint = {
        input: [],
        response: mockResponse,
        startTimestamp: BASE_TIMESTAMP + 1000,
        endTimestamp: BASE_TIMESTAMP + 2000,
      };
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'fetch',
        data: {
          status_code: 200,
          url: 'https://example.com',
        },
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                statusCode: 200,
              },
              description: 'https://example.com',
              endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
              op: 'resource.fetch',
              startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
            },
          },
        },
      ]);
    });

    it('parses fetch response body if necessary', async () => {
      const breadcrumb: Breadcrumb = {
        category: 'fetch',
        data: {
          url: 'https://example.com',
          status_code: 200,
        },
      };

      const mockResponse = getMockResponse('', 'test response');

      const hint: FetchBreadcrumbHint = {
        input: [],
        response: mockResponse,
        startTimestamp: BASE_TIMESTAMP + 1000,
        endTimestamp: BASE_TIMESTAMP + 2000,
      };
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'fetch',
        data: {
          status_code: 200,
          url: 'https://example.com',
        },
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                statusCode: 200,
                response: {
                  size: 13,
                  headers: {},
                },
              },
              description: 'https://example.com',
              endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
              op: 'resource.fetch',
              startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
            },
          },
        },
      ]);
    });

    it('does not add fetch request/response body if URL does not match', async () => {
      options.networkCaptureBodies = true;

      const breadcrumb: Breadcrumb = {
        category: 'fetch',
        data: {
          method: 'GET',
          url: 'https://example2.com',
          status_code: 200,
        },
      };

      const mockResponse = getMockResponse('13', 'test response');

      const hint: FetchBreadcrumbHint = {
        input: ['GET', { body: 'test input' }],
        response: mockResponse,
        startTimestamp: BASE_TIMESTAMP + 1000,
        endTimestamp: BASE_TIMESTAMP + 2000,
      };
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'fetch',
        data: {
          method: 'GET',
          request_body_size: 10,
          response_body_size: 13,
          status_code: 200,
          url: 'https://example2.com',
        },
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                method: 'GET',
                statusCode: 200,
                request: {
                  size: 10,
                  headers: {},
                  _meta: {
                    warnings: ['URL_SKIPPED'],
                  },
                },
                response: {
                  size: 13,
                  headers: {},
                  _meta: {
                    warnings: ['URL_SKIPPED'],
                  },
                },
              },
              description: 'https://example2.com',
              endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
              op: 'resource.fetch',
              startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
            },
          },
        },
      ]);
    });

    it('adds fetch request/response body if configured', async () => {
      options.networkCaptureBodies = true;

      const breadcrumb: Breadcrumb = {
        category: 'fetch',
        data: {
          method: 'GET',
          url: 'https://example.com',
          status_code: 200,
        },
      };

      const mockResponse = getMockResponse('13', 'test response');

      const hint: FetchBreadcrumbHint = {
        input: ['GET', { body: 'test input' }],
        response: mockResponse,
        startTimestamp: BASE_TIMESTAMP + 1000,
        endTimestamp: BASE_TIMESTAMP + 2000,
      };
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'fetch',
        data: {
          method: 'GET',
          request_body_size: 10,
          response_body_size: 13,
          status_code: 200,
          url: 'https://example.com',
        },
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                method: 'GET',
                statusCode: 200,
                request: {
                  size: 10,
                  headers: {},
                  body: 'test input',
                },
                response: {
                  size: 13,
                  headers: {},
                  body: 'test response',
                },
              },
              description: 'https://example.com',
              endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
              op: 'resource.fetch',
              startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
            },
          },
        },
      ]);
    });

    it('adds fetch request/response body as JSON if configured', async () => {
      options.networkCaptureBodies = true;

      const breadcrumb: Breadcrumb = {
        category: 'fetch',
        data: {
          method: 'GET',
          url: 'https://example.com',
          status_code: 200,
        },
      };

      const mockResponse = getMockResponse('', '{"this":"is","json":true}');

      const hint: FetchBreadcrumbHint = {
        input: ['GET', { body: '{"that":"is","json":true}' }],
        response: mockResponse,
        startTimestamp: BASE_TIMESTAMP + 1000,
        endTimestamp: BASE_TIMESTAMP + 2000,
      };
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'fetch',
        data: {
          method: 'GET',
          request_body_size: 25,
          status_code: 200,
          url: 'https://example.com',
        },
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                method: 'GET',
                statusCode: 200,
                request: {
                  size: 25,
                  headers: {},
                  body: { that: 'is', json: true },
                },
                response: {
                  size: 25,
                  headers: {},
                  body: { this: 'is', json: true },
                },
              },
              description: 'https://example.com',
              endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
              op: 'resource.fetch',
              startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
            },
          },
        },
      ]);
    });

    it('skips fetch request/response body if configured & no body found', async () => {
      options.networkCaptureBodies = true;

      const breadcrumb: Breadcrumb = {
        category: 'fetch',
        data: {
          method: 'GET',
          url: 'https://example.com',
          status_code: 200,
        },
      };

      const mockResponse = getMockResponse('', '');

      const hint: FetchBreadcrumbHint = {
        input: ['GET', { body: undefined }],
        response: mockResponse,
        startTimestamp: BASE_TIMESTAMP + 1000,
        endTimestamp: BASE_TIMESTAMP + 2000,
      };
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'fetch',
        data: {
          method: 'GET',
          status_code: 200,
          url: 'https://example.com',
        },
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                method: 'GET',
                statusCode: 200,
              },
              description: 'https://example.com',
              endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
              op: 'resource.fetch',
              startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
            },
          },
        },
      ]);
    });

    it('truncates fetch text request/response body if configured & too large', async () => {
      options.networkCaptureBodies = true;

      const breadcrumb: Breadcrumb = {
        category: 'fetch',
        data: {
          method: 'GET',
          url: 'https://example.com',
          status_code: 200,
        },
      };

      const mockResponse = getMockResponse('', LARGE_BODY);

      const hint: FetchBreadcrumbHint = {
        input: ['GET', { body: LARGE_BODY }],
        response: mockResponse,
        startTimestamp: BASE_TIMESTAMP + 1000,
        endTimestamp: BASE_TIMESTAMP + 2000,
      };
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'fetch',
        data: {
          method: 'GET',
          request_body_size: LARGE_BODY.length,
          status_code: 200,
          url: 'https://example.com',
        },
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                method: 'GET',
                statusCode: 200,
                request: {
                  size: LARGE_BODY.length,
                  headers: {},
                  body: `${LARGE_BODY.slice(0, NETWORK_BODY_MAX_SIZE)}…`,
                  _meta: {
                    warnings: ['TEXT_TRUNCATED'],
                  },
                },
                response: {
                  size: LARGE_BODY.length,
                  headers: {},
                  body: `${LARGE_BODY.slice(0, NETWORK_BODY_MAX_SIZE)}…`,
                  _meta: {
                    warnings: ['TEXT_TRUNCATED'],
                  },
                },
              },
              description: 'https://example.com',
              endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
              op: 'resource.fetch',
              startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
            },
          },
        },
      ]);
    });

    it('truncates fetch JSON request/response body if configured & too large', async () => {
      options.networkCaptureBodies = true;

      const largeBody = JSON.stringify({ a: LARGE_BODY });

      const breadcrumb: Breadcrumb = {
        category: 'fetch',
        data: {
          method: 'GET',
          url: 'https://example.com',
          status_code: 200,
        },
      };

      const mockResponse = {
        headers: {
          get: () => '',
        },
        clone: () => mockResponse,
        text: () => Promise.resolve(largeBody),
      } as unknown as Response;

      const hint: FetchBreadcrumbHint = {
        input: ['GET', { body: largeBody }],
        response: mockResponse,
        startTimestamp: BASE_TIMESTAMP + 1000,
        endTimestamp: BASE_TIMESTAMP + 2000,
      };
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'fetch',
        data: {
          method: 'GET',
          request_body_size: largeBody.length,
          status_code: 200,
          url: 'https://example.com',
        },
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                method: 'GET',
                statusCode: 200,
                request: {
                  size: largeBody.length,
                  headers: {},
                  body: largeBody.slice(0, NETWORK_BODY_MAX_SIZE),
                  _meta: {
                    warnings: ['MAYBE_JSON_TRUNCATED'],
                  },
                },
                response: {
                  size: largeBody.length,
                  headers: {},
                  body: largeBody.slice(0, NETWORK_BODY_MAX_SIZE),
                  _meta: {
                    warnings: ['MAYBE_JSON_TRUNCATED'],
                  },
                },
              },
              description: 'https://example.com',
              endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
              op: 'resource.fetch',
              startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
            },
          },
        },
      ]);
    });

    it('does not add xhr request/response body if URL does not match', async () => {
      options.networkCaptureBodies = true;

      const breadcrumb: Breadcrumb = {
        category: 'xhr',
        data: {
          method: 'GET',
          url: 'https://example2.com',
          status_code: 200,
        },
      };
      const xhr = new XMLHttpRequest();
      Object.defineProperty(xhr, 'response', {
        value: 'test response',
      });
      Object.defineProperty(xhr, 'responseText', {
        value: 'test response',
      });
      const hint: XhrBreadcrumbHint = {
        xhr,
        input: 'test input',
        startTimestamp: BASE_TIMESTAMP + 1000,
        endTimestamp: BASE_TIMESTAMP + 2000,
      };
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'xhr',
        data: {
          method: 'GET',
          request_body_size: 10,
          response_body_size: 13,
          status_code: 200,
          url: 'https://example2.com',
        },
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                method: 'GET',
                statusCode: 200,
                request: {
                  size: 10,
                  headers: {},
                  _meta: {
                    warnings: ['URL_SKIPPED'],
                  },
                },
                response: {
                  size: 13,
                  headers: {},
                  _meta: {
                    warnings: ['URL_SKIPPED'],
                  },
                },
              },
              description: 'https://example2.com',
              endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
              op: 'resource.xhr',
              startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
            },
          },
        },
      ]);
    });

    it('adds xhr request/response body if configured', async () => {
      options.networkCaptureBodies = true;

      const breadcrumb: Breadcrumb = {
        category: 'xhr',
        data: {
          method: 'GET',
          url: 'https://example.com',
          status_code: 200,
        },
      };
      const xhr = new XMLHttpRequest();
      Object.defineProperty(xhr, 'response', {
        value: 'test response',
      });
      Object.defineProperty(xhr, 'responseText', {
        value: 'test response',
      });
      const hint: XhrBreadcrumbHint = {
        xhr,
        input: 'test input',
        startTimestamp: BASE_TIMESTAMP + 1000,
        endTimestamp: BASE_TIMESTAMP + 2000,
      };
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'xhr',
        data: {
          method: 'GET',
          request_body_size: 10,
          response_body_size: 13,
          status_code: 200,
          url: 'https://example.com',
        },
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                method: 'GET',
                statusCode: 200,
                request: {
                  size: 10,
                  headers: {},
                  body: 'test input',
                },
                response: {
                  size: 13,
                  headers: {},
                  body: 'test response',
                },
              },
              description: 'https://example.com',
              endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
              op: 'resource.xhr',
              startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
            },
          },
        },
      ]);
    });

    it('adds xhr JSON request/response body if configured', async () => {
      options.networkCaptureBodies = true;

      const breadcrumb: Breadcrumb = {
        category: 'xhr',
        data: {
          method: 'GET',
          url: 'https://example.com',
          status_code: 200,
        },
      };
      const xhr = new XMLHttpRequest();
      Object.defineProperty(xhr, 'response', {
        value: '{"this":"is","json":true}',
      });
      Object.defineProperty(xhr, 'responseText', {
        value: '{"this":"is","json":true}',
      });
      const hint: XhrBreadcrumbHint = {
        xhr,
        input: '{"that":"is","json":true}',
        startTimestamp: BASE_TIMESTAMP + 1000,
        endTimestamp: BASE_TIMESTAMP + 2000,
      };
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'xhr',
        data: {
          method: 'GET',
          request_body_size: 25,
          response_body_size: 25,
          status_code: 200,
          url: 'https://example.com',
        },
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                method: 'GET',
                statusCode: 200,
                request: {
                  size: 25,
                  headers: {},
                  body: { that: 'is', json: true },
                },
                response: {
                  size: 25,
                  headers: {},
                  body: { this: 'is', json: true },
                },
              },
              description: 'https://example.com',
              endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
              op: 'resource.xhr',
              startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
            },
          },
        },
      ]);
    });

    it('skips xhr request/response body if configured & no body found', async () => {
      options.networkCaptureBodies = true;

      const breadcrumb: Breadcrumb = {
        category: 'xhr',
        data: {
          method: 'GET',
          url: 'https://example.com',
          status_code: 200,
        },
      };
      const xhr = new XMLHttpRequest();
      Object.defineProperty(xhr, 'response', {
        value: '',
      });
      Object.defineProperty(xhr, 'responseText', {
        value: '',
      });
      const hint: XhrBreadcrumbHint = {
        xhr,
        input: '',
        startTimestamp: BASE_TIMESTAMP + 1000,
        endTimestamp: BASE_TIMESTAMP + 2000,
      };
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'xhr',
        data: {
          method: 'GET',
          status_code: 200,
          url: 'https://example.com',
        },
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                method: 'GET',
                statusCode: 200,
              },
              description: 'https://example.com',
              endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
              op: 'resource.xhr',
              startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
            },
          },
        },
      ]);
    });

    it('truncates text xhr request/response body if configured & body too large', async () => {
      options.networkCaptureBodies = true;

      const breadcrumb: Breadcrumb = {
        category: 'xhr',
        data: {
          method: 'GET',
          url: 'https://example.com',
          status_code: 200,
        },
      };
      const xhr = new XMLHttpRequest();
      Object.defineProperty(xhr, 'response', {
        value: LARGE_BODY,
      });
      Object.defineProperty(xhr, 'responseText', {
        value: LARGE_BODY,
      });
      const hint: XhrBreadcrumbHint = {
        xhr,
        input: LARGE_BODY,
        startTimestamp: BASE_TIMESTAMP + 1000,
        endTimestamp: BASE_TIMESTAMP + 2000,
      };
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'xhr',
        data: {
          method: 'GET',
          request_body_size: LARGE_BODY.length,
          response_body_size: LARGE_BODY.length,
          status_code: 200,
          url: 'https://example.com',
        },
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                method: 'GET',
                statusCode: 200,
                request: {
                  size: LARGE_BODY.length,
                  headers: {},
                  body: `${LARGE_BODY.slice(0, NETWORK_BODY_MAX_SIZE)}…`,
                  _meta: {
                    warnings: ['TEXT_TRUNCATED'],
                  },
                },
                response: {
                  size: LARGE_BODY.length,
                  headers: {},
                  body: `${LARGE_BODY.slice(0, NETWORK_BODY_MAX_SIZE)}…`,
                  _meta: {
                    warnings: ['TEXT_TRUNCATED'],
                  },
                },
              },
              description: 'https://example.com',
              endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
              op: 'resource.xhr',
              startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
            },
          },
        },
      ]);
    });

    it('truncates JSON xhr request/response body if configured & body too large', async () => {
      options.networkCaptureBodies = true;

      const largeBody = JSON.stringify({ a: LARGE_BODY });

      const breadcrumb: Breadcrumb = {
        category: 'xhr',
        data: {
          method: 'GET',
          url: 'https://example.com',
          status_code: 200,
        },
      };
      const xhr = new XMLHttpRequest();
      Object.defineProperty(xhr, 'response', {
        value: largeBody,
      });
      Object.defineProperty(xhr, 'responseText', {
        value: largeBody,
      });
      const hint: XhrBreadcrumbHint = {
        xhr,
        input: largeBody,
        startTimestamp: BASE_TIMESTAMP + 1000,
        endTimestamp: BASE_TIMESTAMP + 2000,
      };
      beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'xhr',
        data: {
          method: 'GET',
          request_body_size: largeBody.length,
          response_body_size: largeBody.length,
          status_code: 200,
          url: 'https://example.com',
        },
      });

      await waitForReplayEventBuffer();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                method: 'GET',
                statusCode: 200,
                request: {
                  size: largeBody.length,
                  headers: {},
                  body: largeBody.slice(0, NETWORK_BODY_MAX_SIZE),
                  _meta: {
                    warnings: ['MAYBE_JSON_TRUNCATED'],
                  },
                },
                response: {
                  size: largeBody.length,
                  headers: {},
                  body: largeBody.slice(0, NETWORK_BODY_MAX_SIZE),
                  _meta: {
                    warnings: ['MAYBE_JSON_TRUNCATED'],
                  },
                },
              },
              description: 'https://example.com',
              endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
              op: 'resource.xhr',
              startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
            },
          },
        },
      ]);
    });

    describe.each([
      ['exact string match', 'https://example.com/foo'],
      ['partial string match', 'https://example.com/bar/what'],
      ['exact regex match', 'http://example.com/exact'],
      ['partial regex match', 'http://example.com/partial/string'],
    ])('matching URL %s', (_label, url) => {
      it('correctly matches URL for fetch request', async () => {
        options.networkDetailAllowUrls = [
          'https://example.com/foo',
          'com/bar',
          /^http:\/\/example.com\/exact$/,
          /^http:\/\/example.com\/partial/,
        ];

        const breadcrumb: Breadcrumb = {
          category: 'fetch',
          data: {
            method: 'GET',
            url,
            status_code: 200,
          },
        };

        const mockResponse = getMockResponse('13', 'test response');

        const hint: FetchBreadcrumbHint = {
          input: ['GET', { body: 'test input' }],
          response: mockResponse,
          startTimestamp: BASE_TIMESTAMP + 1000,
          endTimestamp: BASE_TIMESTAMP + 2000,
        };
        beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

        expect(breadcrumb).toEqual({
          category: 'fetch',
          data: {
            method: 'GET',
            request_body_size: 10,
            response_body_size: 13,
            status_code: 200,
            url,
          },
        });

        await waitForReplayEventBuffer();

        expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
          {
            type: 5,
            timestamp: (BASE_TIMESTAMP + 1000) / 1000,
            data: {
              tag: 'performanceSpan',
              payload: {
                data: {
                  method: 'GET',
                  statusCode: 200,
                  request: {
                    size: 10,
                    headers: {},
                  },
                  response: {
                    size: 13,
                    headers: {},
                  },
                },
                description: url,
                endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
                op: 'resource.fetch',
                startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
              },
            },
          },
        ]);
      });

      it('correctly matches URL for xhe request', async () => {
        options.networkDetailAllowUrls = [
          'https://example.com/foo',
          'com/bar',
          /^http:\/\/example.com\/exact$/,
          /^http:\/\/example.com\/partial/,
        ];

        const breadcrumb: Breadcrumb = {
          category: 'xhr',
          data: {
            method: 'GET',
            url,
            status_code: 200,
          },
        };
        const xhr = new XMLHttpRequest();
        Object.defineProperty(xhr, 'response', {
          value: 'test response',
        });
        Object.defineProperty(xhr, 'responseText', {
          value: 'test response',
        });
        const hint: XhrBreadcrumbHint = {
          xhr,
          input: 'test input',
          startTimestamp: BASE_TIMESTAMP + 1000,
          endTimestamp: BASE_TIMESTAMP + 2000,
        };
        beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

        expect(breadcrumb).toEqual({
          category: 'xhr',
          data: {
            method: 'GET',
            request_body_size: 10,
            response_body_size: 13,
            status_code: 200,
            url,
          },
        });

        await waitForReplayEventBuffer();

        expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
          {
            type: 5,
            timestamp: (BASE_TIMESTAMP + 1000) / 1000,
            data: {
              tag: 'performanceSpan',
              payload: {
                data: {
                  method: 'GET',
                  statusCode: 200,
                  request: {
                    size: 10,
                    headers: {},
                  },
                  response: {
                    size: 13,
                    headers: {},
                  },
                },
                description: url,
                endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
                op: 'resource.xhr',
                startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
              },
            },
          },
        ]);
      });
    });

    describe.each([
      ['exact string match', 'https://example.com/foo'],
      ['partial string match', 'https://example.com/bar/what'],
      ['exact regex match', 'http://example.com/exact'],
      ['partial regex match', 'http://example.com/partial/string'],
    ])('matching URL %s', (_label, url) => {
      it('correctly deny URL for fetch request', async () => {
        options.networkDetailDenyUrls = [
          'https://example.com/foo',
          'com/bar',
          /^http:\/\/example.com\/exact$/,
          /^http:\/\/example.com\/partial/,
        ];

        const breadcrumb: Breadcrumb = {
          category: 'fetch',
          data: {
            method: 'GET',
            url,
            status_code: 200,
          },
        };

        const mockResponse = getMockResponse('13', 'test response');

        const hint: FetchBreadcrumbHint = {
          input: ['GET', { body: 'test input' }],
          response: mockResponse,
          startTimestamp: BASE_TIMESTAMP + 1000,
          endTimestamp: BASE_TIMESTAMP + 2000,
        };
        beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

        expect(breadcrumb).toEqual({
          category: 'fetch',
          data: {
            method: 'GET',
            request_body_size: 10,
            response_body_size: 13,
            status_code: 200,
            url,
          },
        });

        await waitForReplayEventBuffer();

        expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
          {
            data: {
              payload: {
                data: {
                  method: 'GET',
                  request: {
                    _meta: {
                      warnings: ['URL_SKIPPED'],
                    },
                    headers: {},
                    size: 10,
                  },
                  response: {
                    _meta: {
                      warnings: ['URL_SKIPPED'],
                    },
                    headers: {},
                    size: 13,
                  },
                  statusCode: 200,
                },
                description: url,
                endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
                op: 'resource.fetch',
                startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
              },
              tag: 'performanceSpan',
            },
            timestamp: (BASE_TIMESTAMP + 1000) / 1000,
            type: 5,
          },
        ]);
      });

      it('correctly deny URL for xhr request', async () => {
        options.networkDetailDenyUrls = [
          'https://example.com/foo',
          'com/bar',
          /^http:\/\/example.com\/exact$/,
          /^http:\/\/example.com\/partial/,
        ];

        const breadcrumb: Breadcrumb = {
          category: 'xhr',
          data: {
            method: 'GET',
            url,
            status_code: 200,
          },
        };
        const xhr = new XMLHttpRequest();
        Object.defineProperty(xhr, 'response', {
          value: 'test response',
        });
        Object.defineProperty(xhr, 'responseText', {
          value: 'test response',
        });
        const hint: XhrBreadcrumbHint = {
          xhr,
          input: 'test input',
          startTimestamp: BASE_TIMESTAMP + 1000,
          endTimestamp: BASE_TIMESTAMP + 2000,
        };
        beforeAddNetworkBreadcrumb(options, breadcrumb, hint);

        expect(breadcrumb).toEqual({
          category: 'xhr',
          data: {
            method: 'GET',
            request_body_size: 10,
            response_body_size: 13,
            status_code: 200,
            url,
          },
        });

        await waitForReplayEventBuffer();

        expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
          {
            data: {
              payload: {
                data: {
                  method: 'GET',
                  request: {
                    _meta: {
                      warnings: ['URL_SKIPPED'],
                    },
                    headers: {},
                    size: 10,
                  },
                  response: {
                    _meta: {
                      warnings: ['URL_SKIPPED'],
                    },
                    headers: {},
                    size: 13,
                  },
                  statusCode: 200,
                },
                description: url,
                endTimestamp: (BASE_TIMESTAMP + 2000) / 1000,
                op: 'resource.xhr',
                startTimestamp: (BASE_TIMESTAMP + 1000) / 1000,
              },
              tag: 'performanceSpan',
            },
            timestamp: (BASE_TIMESTAMP + 1000) / 1000,
            type: 5,
          },
        ]);
      });
    });
  });
});
