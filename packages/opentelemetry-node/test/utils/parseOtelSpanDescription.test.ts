import { SpanKind } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

import { getSanitizedUrl } from '../../src/utils/parseOtelSpanDescription';

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
      },
    ],
    [
      'uses url without query for client request',
      {
        [SemanticAttributes.HTTP_URL]: 'http://example.com/?what=true',
        [SemanticAttributes.HTTP_METHOD]: 'GET',
        [SemanticAttributes.HTTP_TARGET]: '/?what=true',
        [SemanticAttributes.HTTP_HOST]: 'example.com:80',
        [SemanticAttributes.HTTP_STATUS_CODE]: 200,
      },
      SpanKind.CLIENT,
      {
        urlPath: 'http://example.com/',
        url: 'http://example.com/',
        fragment: undefined,
        query: '?what=true',
      },
    ],
    [
      'uses url without hash for client request',
      {
        [SemanticAttributes.HTTP_URL]: 'http://example.com/sub#hash',
        [SemanticAttributes.HTTP_METHOD]: 'GET',
        [SemanticAttributes.HTTP_TARGET]: '/sub#hash',
        [SemanticAttributes.HTTP_HOST]: 'example.com:80',
        [SemanticAttributes.HTTP_STATUS_CODE]: 200,
      },
      SpanKind.CLIENT,
      {
        urlPath: 'http://example.com/sub',
        url: 'http://example.com/sub',
        fragment: '#hash',
        query: undefined,
      },
    ],
    [
      'uses route if available for client request',
      {
        [SemanticAttributes.HTTP_URL]: 'http://example.com/?what=true',
        [SemanticAttributes.HTTP_METHOD]: 'GET',
        [SemanticAttributes.HTTP_TARGET]: '/?what=true',
        [SemanticAttributes.HTTP_ROUTE]: '/my-route',
        [SemanticAttributes.HTTP_HOST]: 'example.com:80',
        [SemanticAttributes.HTTP_STATUS_CODE]: 200,
      },
      SpanKind.CLIENT,
      {
        urlPath: '/my-route',
        url: 'http://example.com/',
        fragment: undefined,
        query: '?what=true',
      },
    ],
    [
      'falls back to target for client request if url not available',
      {
        [SemanticAttributes.HTTP_METHOD]: 'GET',
        [SemanticAttributes.HTTP_TARGET]: '/?what=true',
        [SemanticAttributes.HTTP_HOST]: 'example.com:80',
        [SemanticAttributes.HTTP_STATUS_CODE]: 200,
      },
      SpanKind.CLIENT,
      {
        urlPath: '/',
        url: undefined,
        fragment: undefined,
        query: undefined,
      },
    ],
    [
      'uses target without query for server request',
      {
        [SemanticAttributes.HTTP_URL]: 'http://example.com/?what=true',
        [SemanticAttributes.HTTP_METHOD]: 'GET',
        [SemanticAttributes.HTTP_TARGET]: '/?what=true',
        [SemanticAttributes.HTTP_HOST]: 'example.com:80',
        [SemanticAttributes.HTTP_STATUS_CODE]: 200,
      },
      SpanKind.SERVER,
      {
        urlPath: '/',
        url: 'http://example.com/',
        fragment: undefined,
        query: '?what=true',
      },
    ],
    [
      'uses target without hash for server request',
      {
        [SemanticAttributes.HTTP_URL]: 'http://example.com/?what=true',
        [SemanticAttributes.HTTP_METHOD]: 'GET',
        [SemanticAttributes.HTTP_TARGET]: '/sub#hash',
        [SemanticAttributes.HTTP_HOST]: 'example.com:80',
        [SemanticAttributes.HTTP_STATUS_CODE]: 200,
      },
      SpanKind.SERVER,
      {
        urlPath: '/sub',
        url: 'http://example.com/',
        fragment: undefined,
        query: '?what=true',
      },
    ],
    [
      'uses route for server request if available',
      {
        [SemanticAttributes.HTTP_URL]: 'http://example.com/?what=true',
        [SemanticAttributes.HTTP_METHOD]: 'GET',
        [SemanticAttributes.HTTP_TARGET]: '/?what=true',
        [SemanticAttributes.HTTP_ROUTE]: '/my-route',
        [SemanticAttributes.HTTP_HOST]: 'example.com:80',
        [SemanticAttributes.HTTP_STATUS_CODE]: 200,
      },
      SpanKind.SERVER,
      {
        urlPath: '/my-route',
        url: 'http://example.com/',
        fragment: undefined,
        query: '?what=true',
      },
    ],
  ])('%s', (_, attributes, kind, expected) => {
    const actual = getSanitizedUrl(attributes, kind);

    expect(actual).toEqual(expected);
  });
});
