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
});
