import type { RequestOptions } from 'http';

import { getRequestUrl } from '../../src/utils/getRequestUrl';

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
  ])('works with %s', (input: RequestOptions, expected: string | undefined) => {
    expect(getRequestUrl(input)).toBe(expected);
  });
});
