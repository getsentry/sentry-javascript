/* eslint-disable deprecation/deprecation */
import type { Span } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { SEMATTRS_HTTP_METHOD, SEMATTRS_HTTP_URL } from '@opentelemetry/semantic-conventions';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRequestSpanData } from '../../src/utils/getRequestSpanData';
import { setupOtel } from '../helpers/initOtel';
import { cleanupOtel } from '../helpers/mockSdkInit';
import { getDefaultTestClientOptions, TestClient } from '../helpers/TestClient';

describe('getRequestSpanData', () => {
  let provider: BasicTracerProvider | undefined;

  beforeEach(() => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    [provider] = setupOtel(client);
  });

  afterEach(() => {
    cleanupOtel(provider);
  });

  function createSpan(name: string): Span {
    return trace.getTracer('test').startSpan(name);
  }

  it('works with basic span', () => {
    const span = createSpan('test-span');
    const data = getRequestSpanData(span);

    expect(data).toEqual({});
  });

  it('works with http span', () => {
    const span = createSpan('test-span');
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
    const span = createSpan('test-span');
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
    const span = createSpan('test-span');
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
