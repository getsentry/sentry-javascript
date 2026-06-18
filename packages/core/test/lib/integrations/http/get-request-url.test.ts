import { it, describe, expect } from 'vitest';
import { getRequestUrlFromClientRequest, getRequestUrl } from '../../../../src/integrations/http/get-request-url';
import type { HttpClientRequest, HttpRequestOptions } from '../../../../src/integrations/http/types';

describe('getRequestUrl', () => {
  it.each([
    [{ protocol: 'http:', hostname: 'localhost', port: 80 }, 'http://localhost/'],
    [{ protocol: 'http:', hostname: 'localhost', host: 'localhost:80', port: 80 }, 'http://localhost/'],
    [{ protocol: 'http:', hostname: 'localhost', port: 3000 }, 'http://localhost:3000/'],
    [{ protocol: 'http:', host: 'localhost:3000', port: 3000 }, 'http://localhost:3000/'],
    [{ protocol: 'https:', hostname: 'localhost', port: 443 }, 'https://localhost/'],
    [{ protocol: 'https:', hostname: 'localhost', port: 443, path: '/my-path' }, 'https://localhost/my-path'],
    [
      { protocol: 'https:', hostname: 'www.example.com', port: 443, path: '/my-path' },
      'https://www.example.com/my-path',
    ],
    [{ protocol: 'https:', host: 'www.example.com:443', path: '/my-path' }, 'https://www.example.com/my-path'],
    [
      {
        protocol: 'https:',
        headers: {
          host: 'proxy.local',
        },
        path: 'http://www.example.com:80/',
      },
      'http://www.example.com/',
    ],
    [
      {
        host: 'proxy.local',
        port: 3128,
        method: 'GET',
        path: 'http://target.example/foo',
      },
      'http://target.example/foo',
    ],
    [
      {
        protocol: 'data:',
        host: null,
        method: 'GET',
        path: 'data:text/plain;hello, world!',
      },
      'data:text/plain;hello, world!',
    ],
    // Paths starting with `//` are valid (e.g. S3 object keys) but would otherwise be
    // parsed as protocol-relative URLs. See #21627.
    [
      { protocol: 'https:', hostname: 'my-bucket.s3.us-east-1.amazonaws.com', port: 443, path: '//test.html' },
      'https://my-bucket.s3.us-east-1.amazonaws.com//test.html',
    ],
    [
      {
        protocol: 'https:',
        hostname: 'my-bucket.s3.us-east-1.amazonaws.com',
        port: 443,
        path: '//Trust%20scores/test.html',
      },
      'https://my-bucket.s3.us-east-1.amazonaws.com//Trust%20scores/test.html',
    ],
  ])('works with %s', (input: HttpRequestOptions, expected: string | undefined) => {
    // pretend to be a client request that option-ifies to this value
    const clientRequest = {
      ...input,
      hostname: undefined,
      host: input.hostname ?? input.host,
      headers: undefined,
      getHeaders: () => input.headers ?? {},
    } as unknown as HttpClientRequest;
    expect(String(getRequestUrl(input))).toBe(expected);
    expect(getRequestUrlFromClientRequest(clientRequest)).toBe(expected);
  });

  it('does not throw for unparseable request options, returning an empty string', () => {
    const input = { protocol: 'http:', hostname: '', port: 80, path: '//%' } as HttpRequestOptions;
    expect(() => getRequestUrl(input)).not.toThrow();
    expect(getRequestUrl(input)).toBe('');
  });
});
