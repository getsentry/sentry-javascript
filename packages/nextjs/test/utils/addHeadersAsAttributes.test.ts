import * as SentryCore from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';
import { addHeadersAsAttributes } from '../../src/common/utils/addHeadersAsAttributes';

describe('addHeadersAsAttributes', () => {
  it('returns empty object when headers are undefined', () => {
    expect(addHeadersAsAttributes(undefined)).toEqual({});
  });

  it('returns empty object when httpHeaders.request is false', () => {
    vi.spyOn(SentryCore, 'getClient').mockReturnValue({
      getDataCollectionOptions: () => ({
        httpHeaders: { request: false, response: true },
      }),
    } as unknown as SentryCore.Client);

    const result = addHeadersAsAttributes({ 'content-type': 'application/json' });
    expect(result).toEqual({});
  });

  it('passes PII headers through when httpHeaders.request is true', () => {
    vi.spyOn(SentryCore, 'getClient').mockReturnValue({
      getDataCollectionOptions: () => ({
        httpHeaders: { request: true, response: true },
      }),
    } as unknown as SentryCore.Client);

    const result = addHeadersAsAttributes({
      'content-type': 'application/json',
      'x-forwarded-for': '127.0.0.1',
    });

    expect(result).toMatchObject({
      'http.request.header.content_type': 'application/json',
      'http.request.header.x_forwarded_for': '127.0.0.1',
    });
  });

  it('filters denied headers when httpHeaders.request is a deny list', () => {
    vi.spyOn(SentryCore, 'getClient').mockReturnValue({
      getDataCollectionOptions: () => ({
        httpHeaders: { request: { deny: ['forwarded'] }, response: true },
      }),
    } as unknown as SentryCore.Client);

    const result = addHeadersAsAttributes({
      'content-type': 'application/json',
      'x-forwarded-for': '127.0.0.1',
    });

    expect(result['http.request.header.content_type']).toBe('application/json');
    expect(result['http.request.header.x_forwarded_for']).toBe('[Filtered]');
  });
});
