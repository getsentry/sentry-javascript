/* eslint-disable deprecation/deprecation */
import type { Span } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import {
  ATTR_HTTP_ROUTE,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_FAAS_TRIGGER,
  SEMATTRS_HTTP_HOST,
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_STATUS_CODE,
  SEMATTRS_HTTP_TARGET,
  SEMATTRS_HTTP_URL,
  SEMATTRS_MESSAGING_SYSTEM,
  SEMATTRS_RPC_SERVICE,
} from '@opentelemetry/semantic-conventions';

import { descriptionForHttpMethod, getSanitizedUrl, parseSpanDescription } from '../../src/utils/parseSpanDescription';

describe('parseSpanDescription', () => {
  it.each([
    [
      'works without attributes & name',
      undefined,
      undefined,
      undefined,
      {
        description: '<unknown>',
        op: undefined,
        source: 'custom',
      },
    ],
    [
      'works with empty attributes',
      {},
      'test name',
      SpanKind.CLIENT,
      {
        description: 'test name',
        op: undefined,
        source: 'custom',
      },
    ],
    [
      'works with deprecated http method',
      {
        [SEMATTRS_HTTP_METHOD]: 'GET',
      },
      'test name',
      SpanKind.CLIENT,
      {
        description: 'test name',
        op: 'http.client',
        source: 'custom',
      },
    ],
    [
      'works with http method',
      {
        'http.request.method': 'GET',
      },
      'test name',
      SpanKind.CLIENT,
      {
        description: 'test name',
        op: 'http.client',
        source: 'custom',
      },
    ],
    [
      'works with db system',
      {
        [SEMATTRS_DB_SYSTEM]: 'mysql',
        [SEMATTRS_DB_STATEMENT]: 'SELECT * from users',
      },
      'test name',
      SpanKind.CLIENT,
      {
        description: 'SELECT * from users',
        op: 'db',
        source: 'task',
      },
    ],
    [
      'works with db system without statement',
      {
        [SEMATTRS_DB_SYSTEM]: 'mysql',
      },
      'test name',
      SpanKind.CLIENT,
      {
        description: 'test name',
        op: 'db',
        source: 'task',
      },
    ],
    [
      'works with rpc service',
      {
        [SEMATTRS_RPC_SERVICE]: 'rpc-test-service',
      },
      'test name',
      undefined,
      {
        description: 'test name',
        op: 'rpc',
        source: 'route',
      },
    ],
    [
      'works with messaging system',
      {
        [SEMATTRS_MESSAGING_SYSTEM]: 'test-messaging-system',
      },
      'test name',
      undefined,
      {
        description: 'test name',
        op: 'message',
        source: 'route',
      },
    ],
    [
      'works with faas trigger',
      {
        [SEMATTRS_FAAS_TRIGGER]: 'test-faas-trigger',
      },
      'test name',
      undefined,
      {
        description: 'test name',
        op: 'test-faas-trigger',
        source: 'route',
      },
    ],
  ])('%s', (_, attributes, name, kind, expected) => {
    const actual = parseSpanDescription({ attributes, kind, name } as unknown as Span);
    expect(actual).toEqual(expected);
  });
});

describe('descriptionForHttpMethod', () => {
  it.each([
    [
      'works without attributes',
      'GET',
      {},
      'test name',
      SpanKind.CLIENT,
      {
        op: 'http.client',
        description: 'test name',
        source: 'custom',
      },
    ],
    [
      'works with basic client GET',
      'GET',
      {
        [SEMATTRS_HTTP_METHOD]: 'GET',
        [SEMATTRS_HTTP_URL]: 'https://www.example.com/my-path',
        [SEMATTRS_HTTP_TARGET]: '/my-path',
      },
      'test name',
      SpanKind.CLIENT,
      {
        op: 'http.client',
        description: 'GET https://www.example.com/my-path',
        data: {
          url: 'https://www.example.com/my-path',
        },
        source: 'url',
      },
    ],
    [
      'works with basic server POST',
      'POST',
      {
        [SEMATTRS_HTTP_METHOD]: 'POST',
        [SEMATTRS_HTTP_URL]: 'https://www.example.com/my-path',
        [SEMATTRS_HTTP_TARGET]: '/my-path',
      },
      'test name',
      SpanKind.SERVER,
      {
        op: 'http.server',
        description: 'POST /my-path',
        data: {
          url: 'https://www.example.com/my-path',
        },
        source: 'url',
      },
    ],
    [
      'works with client GET with route',
      'GET',
      {
        [SEMATTRS_HTTP_METHOD]: 'GET',
        [SEMATTRS_HTTP_URL]: 'https://www.example.com/my-path/123',
        [SEMATTRS_HTTP_TARGET]: '/my-path/123',
        [ATTR_HTTP_ROUTE]: '/my-path/:id',
      },
      'test name',
      SpanKind.CLIENT,
      {
        op: 'http.client',
        description: 'GET /my-path/:id',
        data: {
          url: 'https://www.example.com/my-path/123',
        },
        source: 'route',
      },
    ],
    [
      'works with basic client GET with SpanKind.INTERNAL',
      'GET',
      {
        [SEMATTRS_HTTP_METHOD]: 'GET',
        [SEMATTRS_HTTP_URL]: 'https://www.example.com/my-path',
        [SEMATTRS_HTTP_TARGET]: '/my-path',
      },
      'test name',
      SpanKind.INTERNAL,
      {
        op: 'http',
        description: 'test name',
        data: {
          url: 'https://www.example.com/my-path',
        },
        source: 'custom',
      },
    ],
  ])('%s', (_, httpMethod, attributes, name, kind, expected) => {
    const actual = descriptionForHttpMethod({ attributes, kind, name }, httpMethod);
    expect(actual).toEqual(expected);
  });
});

describe('getSanitizedUrl', () => {
  it.each([
    [
      'works without attributes',
      {},
      SpanKind.CLIENT,
      {
        urlPath: undefined,
        url: undefined,
        fragment: undefined,
        query: undefined,
        hasRoute: false,
      },
    ],
    [
      'uses url without query for client request',
      {
        [SEMATTRS_HTTP_URL]: 'http://example.com/?what=true',
        [SEMATTRS_HTTP_METHOD]: 'GET',
        [SEMATTRS_HTTP_TARGET]: '/?what=true',
        [SEMATTRS_HTTP_HOST]: 'example.com:80',
        [SEMATTRS_HTTP_STATUS_CODE]: 200,
      },
      SpanKind.CLIENT,
      {
        urlPath: 'http://example.com/',
        url: 'http://example.com/',
        fragment: undefined,
        query: '?what=true',
        hasRoute: false,
      },
    ],
    [
      'uses url without hash for client request',
      {
        [SEMATTRS_HTTP_URL]: 'http://example.com/sub#hash',
        [SEMATTRS_HTTP_METHOD]: 'GET',
        [SEMATTRS_HTTP_TARGET]: '/sub#hash',
        [SEMATTRS_HTTP_HOST]: 'example.com:80',
        [SEMATTRS_HTTP_STATUS_CODE]: 200,
      },
      SpanKind.CLIENT,
      {
        urlPath: 'http://example.com/sub',
        url: 'http://example.com/sub',
        fragment: '#hash',
        query: undefined,
        hasRoute: false,
      },
    ],
    [
      'uses route if available for client request',
      {
        [SEMATTRS_HTTP_URL]: 'http://example.com/?what=true',
        [SEMATTRS_HTTP_METHOD]: 'GET',
        [SEMATTRS_HTTP_TARGET]: '/?what=true',
        [ATTR_HTTP_ROUTE]: '/my-route',
        [SEMATTRS_HTTP_HOST]: 'example.com:80',
        [SEMATTRS_HTTP_STATUS_CODE]: 200,
      },
      SpanKind.CLIENT,
      {
        urlPath: '/my-route',
        url: 'http://example.com/',
        fragment: undefined,
        query: '?what=true',
        hasRoute: true,
      },
    ],
    [
      'falls back to target for client request if url not available',
      {
        [SEMATTRS_HTTP_METHOD]: 'GET',
        [SEMATTRS_HTTP_TARGET]: '/?what=true',
        [SEMATTRS_HTTP_HOST]: 'example.com:80',
        [SEMATTRS_HTTP_STATUS_CODE]: 200,
      },
      SpanKind.CLIENT,
      {
        urlPath: '/',
        url: undefined,
        fragment: undefined,
        query: undefined,
        hasRoute: false,
      },
    ],
    [
      'uses target without query for server request',
      {
        [SEMATTRS_HTTP_URL]: 'http://example.com/?what=true',
        [SEMATTRS_HTTP_METHOD]: 'GET',
        [SEMATTRS_HTTP_TARGET]: '/?what=true',
        [SEMATTRS_HTTP_HOST]: 'example.com:80',
        [SEMATTRS_HTTP_STATUS_CODE]: 200,
      },
      SpanKind.SERVER,
      {
        urlPath: '/',
        url: 'http://example.com/',
        fragment: undefined,
        query: '?what=true',
        hasRoute: false,
      },
    ],
    [
      'uses target without hash for server request',
      {
        [SEMATTRS_HTTP_URL]: 'http://example.com/?what=true',
        [SEMATTRS_HTTP_METHOD]: 'GET',
        [SEMATTRS_HTTP_TARGET]: '/sub#hash',
        [SEMATTRS_HTTP_HOST]: 'example.com:80',
        [SEMATTRS_HTTP_STATUS_CODE]: 200,
      },
      SpanKind.SERVER,
      {
        urlPath: '/sub',
        url: 'http://example.com/',
        fragment: undefined,
        query: '?what=true',
        hasRoute: false,
      },
    ],
    [
      'uses route for server request if available',
      {
        [SEMATTRS_HTTP_URL]: 'http://example.com/?what=true',
        [SEMATTRS_HTTP_METHOD]: 'GET',
        [SEMATTRS_HTTP_TARGET]: '/?what=true',
        [ATTR_HTTP_ROUTE]: '/my-route',
        [SEMATTRS_HTTP_HOST]: 'example.com:80',
        [SEMATTRS_HTTP_STATUS_CODE]: 200,
      },
      SpanKind.SERVER,
      {
        urlPath: '/my-route',
        url: 'http://example.com/',
        fragment: undefined,
        query: '?what=true',
        hasRoute: true,
      },
    ],
  ])('%s', (_, attributes, kind, expected) => {
    const actual = getSanitizedUrl(attributes, kind);

    expect(actual).toEqual(expected);
  });
});
