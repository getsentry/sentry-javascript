import { SEMATTRS_HTTP_METHOD, SEMATTRS_HTTP_URL } from '@opentelemetry/semantic-conventions';

import { getRequestSpanData } from '../../src/utils/getRequestSpanData';
import { createSpan } from '../helpers/createSpan';

describe('getRequestSpanData', () => {
  it('works with basic span', () => {
    const span = createSpan();
    const data = getRequestSpanData(span);

    expect(data).toEqual({});
  });

  it('works with http span', () => {
    const span = createSpan();
    span.setAttributes({
      [SEMATTRS_HTTP_URL]: 'http://example.com?foo=bar#baz',
      [SEMATTRS_HTTP_METHOD]: 'GET',
    });

    const data = getRequestSpanData(span);

    expect(data).toEqual({
      url: 'http://example.com',
      'http.method': 'GET',
      'http.query': '?foo=bar',
      'http.fragment': '#baz',
    });
  });

  it('works without method', () => {
    const span = createSpan();
    span.setAttributes({
      [SEMATTRS_HTTP_URL]: 'http://example.com',
    });

    const data = getRequestSpanData(span);

    expect(data).toEqual({
      url: 'http://example.com',
      'http.method': 'GET',
    });
  });

  it('works with incorrect URL', () => {
    const span = createSpan();
    span.setAttributes({
      [SEMATTRS_HTTP_URL]: 'malformed-url-here',
      [SEMATTRS_HTTP_METHOD]: 'GET',
    });

    const data = getRequestSpanData(span);

    expect(data).toEqual({
      url: 'malformed-url-here',
      'http.method': 'GET',
    });
  });
});
