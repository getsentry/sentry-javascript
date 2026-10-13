import { describe, expect, it } from 'vitest';
import { getNormalizedRequestFromAttributes } from '../../../src/common/utils/getNormalizedRequestFromAttributes';

describe('getNormalizedRequestFromAttributes', () => {
  it('builds a request from `http.method` and `http.target` (edge middleware sample-time attributes)', () => {
    const normalizedRequest = getNormalizedRequestFromAttributes({
      'http.method': 'GET',
      'http.target': '/api/endpoint-behind-middleware?query=123',
    });

    expect(normalizedRequest).toEqual({
      method: 'GET',
      url: '/api/endpoint-behind-middleware?query=123',
      query_string: 'query=123',
    });
  });

  it('prefers the new `http.request.method` and `url.full` attributes', () => {
    const normalizedRequest = getNormalizedRequestFromAttributes({
      'http.request.method': 'POST',
      'http.method': 'GET',
      'url.full': 'https://example.com/foo?a=1',
      'http.target': '/foo?a=1',
    });

    expect(normalizedRequest).toEqual({
      method: 'POST',
      url: 'https://example.com/foo?a=1',
      query_string: 'a=1',
    });
  });

  it('prefers the `url.query` attribute over parsing the url', () => {
    const normalizedRequest = getNormalizedRequestFromAttributes({
      'http.method': 'GET',
      'url.full': 'https://example.com/foo?a=1&b=2',
      'url.query': 'a=1&b=2',
    });

    expect(normalizedRequest).toEqual({
      method: 'GET',
      url: 'https://example.com/foo?a=1&b=2',
      query_string: 'a=1&b=2',
    });
  });

  it('omits `query_string` when there is no query', () => {
    const normalizedRequest = getNormalizedRequestFromAttributes({
      'http.method': 'GET',
      'http.target': '/foo',
    });

    expect(normalizedRequest).toEqual({
      method: 'GET',
      url: '/foo',
    });
  });

  it('builds a request when only the method is available', () => {
    const normalizedRequest = getNormalizedRequestFromAttributes({
      'http.method': 'GET',
    });

    expect(normalizedRequest).toEqual({ method: 'GET' });
  });

  it('builds a request when only the url is available', () => {
    const normalizedRequest = getNormalizedRequestFromAttributes({
      'http.target': '/foo?a=1',
    });

    expect(normalizedRequest).toEqual({ url: '/foo?a=1', query_string: 'a=1' });
  });

  it('falls back to `url.path` when `url.full` and `http.target` are absent', () => {
    const normalizedRequest = getNormalizedRequestFromAttributes({
      'http.request.method': 'GET',
      'url.path': '/api/resource',
      'url.query': 'page=2',
    });

    expect(normalizedRequest).toEqual({
      method: 'GET',
      url: '/api/resource',
      query_string: 'page=2',
    });
  });

  it('prefers `url.full` over `url.path`', () => {
    const normalizedRequest = getNormalizedRequestFromAttributes({
      'http.request.method': 'GET',
      'url.full': 'https://example.com/api/resource?page=2',
      'url.path': '/api/resource',
    });

    expect(normalizedRequest).toEqual({
      method: 'GET',
      url: 'https://example.com/api/resource?page=2',
      query_string: 'page=2',
    });
  });

  it('returns undefined when neither method nor url is present', () => {
    expect(getNormalizedRequestFromAttributes({})).toBeUndefined();
    expect(getNormalizedRequestFromAttributes({ 'next.span_type': 'Middleware.execute' })).toBeUndefined();
  });
});
