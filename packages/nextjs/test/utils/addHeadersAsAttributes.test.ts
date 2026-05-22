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

  it('includes all headers with sensitive filtering when httpHeaders.request is true', () => {
    vi.spyOn(SentryCore, 'getClient').mockReturnValue({
      getDataCollectionOptions: () => ({
        httpHeaders: { request: true, response: true },
      }),
    } as unknown as SentryCore.Client);

    const result = addHeadersAsAttributes({
      'content-type': 'application/json',
      accept: 'text/html',
    });

    expect(result).toMatchObject({
      'http.request.header.content_type': 'application/json',
      'http.request.header.accept': 'text/html',
    });
  });

  it('applies stricter PII filtering when httpHeaders.request is a deny list', () => {
    vi.spyOn(SentryCore, 'getClient').mockReturnValue({
      getDataCollectionOptions: () => ({
        httpHeaders: { request: { deny: [] }, response: true },
      }),
    } as unknown as SentryCore.Client);

    const result = addHeadersAsAttributes({
      'content-type': 'application/json',
      accept: 'text/html',
    });

    expect(result).toMatchObject({
      'http.request.header.content_type': 'application/json',
      'http.request.header.accept': 'text/html',
    });
  });

  it('returns empty object when no client is available', () => {
    vi.spyOn(SentryCore, 'getClient').mockReturnValue(undefined);

    const result = addHeadersAsAttributes({ 'content-type': 'application/json' });
    expect(result).toEqual({});
  });
});
