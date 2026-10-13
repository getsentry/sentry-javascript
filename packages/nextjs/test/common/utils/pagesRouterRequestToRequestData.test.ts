import type { IncomingMessage } from 'http';
import { describe, expect, it } from 'vitest';
import { pagesRouterRequestToRequestData } from '../../../src/common/utils/pagesRouterRequestToRequestData';

function createRequest(url: string, initURL?: unknown): IncomingMessage {
  const req = {
    method: 'GET',
    url,
    headers: { host: 'example.com' },
    socket: {},
  } as unknown as IncomingMessage;

  if (initURL !== undefined) {
    (req as unknown as Record<symbol, unknown>)[Symbol.for('NextInternalRequestMeta')] = { initURL };
  }

  return req;
}

describe('pagesRouterRequestToRequestData', () => {
  it('uses `req.url` when there is no Next.js request meta', () => {
    expect(pagesRouterRequestToRequestData(createRequest('/foo/bar?q=1'))).toMatchObject({
      url: 'http://example.com/foo/bar?q=1',
      query_string: 'q=1',
      method: 'GET',
    });
  });

  it('restores the basePath from a relative `initURL`', () => {
    expect(pagesRouterRequestToRequestData(createRequest('/foo/bar?q=1', '/base/foo/bar?q=1'))).toMatchObject({
      url: 'http://example.com/base/foo/bar?q=1',
      query_string: 'q=1',
      method: 'GET',
    });
  });

  it('restores the basePath for the basePath root', () => {
    expect(pagesRouterRequestToRequestData(createRequest('/', '/base'))).toMatchObject({
      url: 'http://example.com/base',
    });
  });

  it('takes only path and query from an absolute `initURL` and keeps the origin from the request headers', () => {
    expect(
      pagesRouterRequestToRequestData(createRequest('/foo/bar', 'http://localhost:3000/base/foo/bar')),
    ).toMatchObject({
      url: 'http://example.com/base/foo/bar',
    });
  });

  it('ignores a non-string `initURL`', () => {
    expect(pagesRouterRequestToRequestData(createRequest('/foo/bar', 123))).toMatchObject({
      url: 'http://example.com/foo/bar',
    });
  });
});
