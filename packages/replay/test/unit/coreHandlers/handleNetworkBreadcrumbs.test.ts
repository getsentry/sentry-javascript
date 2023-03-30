import type {
  Breadcrumb,
  BreadcrumbHint,
  FetchBreadcrumbHint,
  TextEncoderInternal,
  XhrBreadcrumbHint,
} from '@sentry/types';
import { TextEncoder } from 'util';

import { BASE_TIMESTAMP } from '../..';
import { NETWORK_BODY_MAX_SIZE } from '../../../src/constants';
import { beforeAddNetworkBreadcrumb } from '../../../src/coreHandlers/handleNetworkBreadcrumbs';
import type { EventBufferArray } from '../../../src/eventBuffer/EventBufferArray';
import type { ReplayContainer } from '../../../src/types';
import { setupReplayContainer } from '../../utils/setupReplayContainer';

jest.useFakeTimers();

async function waitForReplayEventBuffer() {
  // Need one Promise.resolve() per await in the util functions
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const LARGE_BODY = 'a'.repeat(NETWORK_BODY_MAX_SIZE + 1);

describe('Unit | coreHandlers | handleNetworkBreadcrumbs', () => {
  describe('beforeAddNetworkBreadcrumb()', () => {
    let options: {
      replay: ReplayContainer;
      textEncoder: TextEncoderInternal;
      captureBodies: boolean;
    };

    beforeEach(() => {
      jest.setSystemTime(BASE_TIMESTAMP);

      options = {
        textEncoder: new TextEncoder(),
        replay: setupReplayContainer(),
        captureBodies: false,
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
      const xhr = new XMLHttpRequest();
      Object.defineProperty(xhr, 'response', {
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
                },
                response: {
                  size: 13,
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

      const mockResponse = {
        headers: {
          get: () => '13',
        },
      } as unknown as Response;

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
                request: {
                  size: 10,
                },
                response: {
                  size: 13,
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

      const mockResponse = {
        headers: {
          get: () => '',
        },
      } as unknown as Response;

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

      const mockResponse = {
        headers: {
          get: () => '',
        },
        clone: () => mockResponse,
        text: () => Promise.resolve('test response'),
      } as unknown as Response;

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

    it('adds fetch request/response body if configured', async () => {
      options.captureBodies = true;

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
          get: () => '13',
        },
        clone: () => mockResponse,
        text: () => Promise.resolve('test response'),
      } as unknown as Response;

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
                  body: 'test input',
                },
                response: {
                  size: 13,
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
      options.captureBodies = true;

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
        text: () => Promise.resolve('{"this":"is","json":true}'),
      } as unknown as Response;

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
                  body: { that: 'is', json: true },
                },
                response: {
                  size: 25,
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
      options.captureBodies = true;

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
        text: () => Promise.resolve(''),
      } as unknown as Response;

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

    it('skips fetch request/response body if configured & too large', async () => {
      options.captureBodies = true;

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
        text: () => Promise.resolve(LARGE_BODY),
      } as unknown as Response;

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
                  _meta: {
                    errors: ['MAX_BODY_SIZE_EXCEEDED'],
                  },
                },
                response: {
                  size: LARGE_BODY.length,
                  _meta: {
                    errors: ['MAX_BODY_SIZE_EXCEEDED'],
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

    it('adds xhr request/response body if configured', async () => {
      options.captureBodies = true;

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
                  body: 'test input',
                },
                response: {
                  size: 13,
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
      options.captureBodies = true;

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
                  body: { that: 'is', json: true },
                },
                response: {
                  size: 25,
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
      options.captureBodies = true;

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

    it('skip xhr request/response body if configured & body too large', async () => {
      options.captureBodies = true;

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
                  _meta: {
                    errors: ['MAX_BODY_SIZE_EXCEEDED'],
                  },
                },
                response: {
                  size: LARGE_BODY.length,
                  _meta: {
                    errors: ['MAX_BODY_SIZE_EXCEEDED'],
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
  });
});
