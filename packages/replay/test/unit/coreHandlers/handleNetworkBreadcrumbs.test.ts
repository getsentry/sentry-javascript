import { TextEncoder } from 'util';

import {
  getBodySize,
  parseContentSizeHeader,
  handleNetworkBreadcrumb,
} from '../../../src/coreHandlers/handleNetworkBreadcrumbs';
import {
  Breadcrumb,
  BreadcrumbHint,
  TextEncoderInternal,
  XhrBreadcrumbData,
  XhrBreadcrumbHint,
  FetchBreadcrumbHint,
} from '@sentry/types';
import { setupReplayContainer } from '../../utils/setupReplayContainer';
import { ReplayContainer } from '../../../src/types';
import { EventBufferArray } from '../../../src/eventBuffer/EventBufferArray';
import { BASE_TIMESTAMP } from '../..';

jest.useFakeTimers();

describe('Unit | coreHandlers | handleNetworkBreadcrumbs', () => {
  describe('parseContentSizeHeader()', () => {
    it.each([
      [undefined, undefined],
      [null, undefined],
      ['', undefined],
      ['12', 12],
      ['abc', undefined],
    ])('works with %s header value', (headerValue, size) => {
      expect(parseContentSizeHeader(headerValue)).toBe(size);
    });
  });

  describe('getBodySize()', () => {
    const textEncoder = new TextEncoder();

    it('works with empty body', () => {
      expect(getBodySize(undefined, textEncoder)).toBe(undefined);
      expect(getBodySize(null, textEncoder)).toBe(undefined);
      expect(getBodySize('', textEncoder)).toBe(undefined);
    });

    it('works with string body', () => {
      expect(getBodySize('abcd', textEncoder)).toBe(4);
      // Emojis are correctly counted as mutliple characters
      expect(getBodySize('With emoji: 😈', textEncoder)).toBe(16);
    });

    it('works with URLSearchParams', () => {
      const params = new URLSearchParams();
      params.append('name', 'Jane');
      params.append('age', '42');
      params.append('emoji', '😈');

      expect(getBodySize(params, textEncoder)).toBe(35);
    });

    it('works with FormData', () => {
      const formData = new FormData();
      formData.append('name', 'Jane');
      formData.append('age', '42');
      formData.append('emoji', '😈');

      expect(getBodySize(formData, textEncoder)).toBe(35);
    });

    it('works with Blob', () => {
      const blob = new Blob(['<html>Hello world: 😈</html>'], { type: 'text/html' });

      expect(getBodySize(blob, textEncoder)).toBe(30);
    });

    it('works with ArrayBuffer', () => {
      const arrayBuffer = new ArrayBuffer(8);

      expect(getBodySize(arrayBuffer, textEncoder)).toBe(8);
    });
  });

  describe('handleNetworkBreadcrumb()', () => {
    let options: {
      replay: ReplayContainer;
      textEncoder: TextEncoderInternal;
    };

    beforeEach(() => {
      jest.setSystemTime(BASE_TIMESTAMP);

      options = {
        textEncoder: new TextEncoder(),
        replay: setupReplayContainer(),
      };

      jest.runAllTimers();
    });

    it('ignores breadcrumb without data', () => {
      const breadcrumb: Breadcrumb = {};
      const hint: BreadcrumbHint = {};
      handleNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({});
      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([]);
    });

    it('ignores non-network breadcrumbs', () => {
      const breadcrumb: Breadcrumb = {
        category: 'foo',
        data: {},
      };
      const hint: BreadcrumbHint = {};
      handleNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'foo',
        data: {},
      });
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
      handleNetworkBreadcrumb(options, breadcrumb, hint);

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

      jest.runAllTimers();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                method: 'GET',
                requestBodySize: 10,
                responseBodySize: 13,
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
      handleNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'xhr',
        data: {
          status_code: 200,
          url: 'https://example.com',
        },
      });

      jest.runAllTimers();

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
      handleNetworkBreadcrumb(options, breadcrumb, hint);

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

      jest.runAllTimers();

      expect((options.replay.eventBuffer as EventBufferArray).events).toEqual([
        {
          type: 5,
          timestamp: (BASE_TIMESTAMP + 1000) / 1000,
          data: {
            tag: 'performanceSpan',
            payload: {
              data: {
                method: 'GET',
                requestBodySize: 10,
                responseBodySize: 13,
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
      handleNetworkBreadcrumb(options, breadcrumb, hint);

      expect(breadcrumb).toEqual({
        category: 'fetch',
        data: {
          status_code: 200,
          url: 'https://example.com',
        },
      });

      jest.runAllTimers();

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
  });
});
