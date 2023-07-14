import { SpanKind } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

import { getSanitizedUrl } from '../../src/utils/parseOtelSpanDescription';

describe('getSanitizedUrl', () => {
  it.each([
    ['works without attributes', {}, SpanKind.CLIENT, undefined],
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
      'http://example.com/',
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
      'http://example.com/sub',
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
      '/my-route',
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
      '/',
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
      '/',
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
      '/sub',
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
      '/my-route',
    ],
  ])('%s', (_, attributes, kind, expected) => {
    const actual = getSanitizedUrl(attributes, kind);

    expect(actual).toEqual(expected);
  });
});
