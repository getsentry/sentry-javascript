import type { RemixRequest } from '../../src/utils/vendor/types';
import { normalizeRemixRequest } from '../../src/utils/web-fetch';

class Headers {
  private _headers: Record<string, string> = {};

  constructor(headers?: Iterable<[string, string]>) {
    if (headers) {
      for (const [key, value] of headers) {
        this.set(key, value);
      }
    }
  }
  static fromEntries(entries: Iterable<[string, string]>): Headers {
    return new Headers(entries);
  }
  entries(): IterableIterator<[string, string]> {
    return Object.entries(this._headers)[Symbol.iterator]();
  }

  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries();
  }

  get(key: string): string | null {
    return this._headers[key] ?? null;
  }

  has(key: string): boolean {
    return this._headers[key] !== undefined;
  }

  set(key: string, value: string): void {
    this._headers[key] = value;
  }
}

class Request {
  private _url: string;
  private _options: { method: string; body?: any; headers: Headers };

  constructor(url: string, options: { method: string; body?: any; headers: Headers }) {
    this._url = url;
    this._options = options;
  }

  get method() {
    return this._options.method;
  }

  get url() {
    return this._url;
  }

  get headers() {
    return this._options.headers;
  }

  get body() {
    return this._options.body;
  }
}

describe('normalizeRemixRequest', () => {
  it('should normalize remix web-fetch request', () => {
    const headers = new Headers();
    headers.set('Accept', 'text/html,application/json');
    headers.set('Cookie', 'name=value');
    const request = new Request('https://example.com/api/json?id=123', {
      method: 'GET',
      headers: headers as any,
    });

    const expected = {
      agent: undefined,
      hash: '',
      headers: {
        Accept: 'text/html,application/json',
        Connection: 'close',
        Cookie: 'name=value',
        'User-Agent': 'node-fetch',
      },
      hostname: 'example.com',
      href: 'https://example.com/api/json?id=123',
      insecureHTTPParser: undefined,
      ip: null,
      method: 'GET',
      originalUrl: 'https://example.com/api/json?id=123',
      path: '/api/json?id=123',
      pathname: '/api/json',
      port: '',
      protocol: 'https:',
      query: undefined,
      search: '?id=123',
    };

    const normalizedRequest = normalizeRemixRequest(request as unknown as RemixRequest);
    expect(normalizedRequest).toEqual(expected);
  });
});
