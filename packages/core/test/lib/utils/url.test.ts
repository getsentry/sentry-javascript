import { describe, expect, it } from 'vitest';
import {
  getHttpSpanDetailsFromUrlObject,
  getSanitizedUrlString,
  getSanitizedUrlStringFromUrlObject,
  isURLObjectRelative,
  parseStringToURLObject,
  parseUrl,
  stripDataUrlContent,
  stripUrlQueryAndFragment,
} from '../../../src/utils/url';

describe('stripQueryStringAndFragment', () => {
  const urlString = 'http://dogs.are.great:1231/yay/';
  const queryString = '?furry=yes&funny=very';
  const fragment = '#adoptnotbuy';

  it('strips query string from url', () => {
    const urlWithQueryString = `${urlString}${queryString}`;
    expect(stripUrlQueryAndFragment(urlWithQueryString)).toBe(urlString);
  });

  it('strips fragment from url', () => {
    const urlWithFragment = `${urlString}${fragment}`;
    expect(stripUrlQueryAndFragment(urlWithFragment)).toBe(urlString);
  });

  it('strips query string and fragment from url', () => {
    const urlWithQueryStringAndFragment = `${urlString}${queryString}${fragment}`;
    expect(stripUrlQueryAndFragment(urlWithQueryStringAndFragment)).toBe(urlString);
  });
});

describe('getSanitizedUrlString', () => {
  it.each([
    ['regular url', 'https://somedomain.com', 'https://somedomain.com'],
    ['regular url with a path', 'https://somedomain.com/path/to/happiness', 'https://somedomain.com/path/to/happiness'],
    [
      'url with standard http port 80',
      'http://somedomain.com:80/path/to/happiness',
      'http://somedomain.com/path/to/happiness',
    ],
    [
      'url with standard https port 443',
      'https://somedomain.com:443/path/to/happiness',
      'https://somedomain.com/path/to/happiness',
    ],
    [
      'url with non-standard port',
      'https://somedomain.com:4200/path/to/happiness',
      'https://somedomain.com:4200/path/to/happiness',
    ],
    [
      'url with query params',
      'https://somedomain.com:4200/path/to/happiness?auhtToken=abc123&param2=bar',
      'https://somedomain.com:4200/path/to/happiness',
    ],
    [
      'url with a fragment',
      'https://somedomain.com/path/to/happiness#somewildfragment123',
      'https://somedomain.com/path/to/happiness',
    ],
    [
      'url with a fragment and query params',
      'https://somedomain.com/path/to/happiness#somewildfragment123?auhtToken=abc123&param2=bar',
      'https://somedomain.com/path/to/happiness',
    ],
    [
      'url with authorization',
      'https://username:password@somedomain.com',
      'https://[filtered]:[filtered]@somedomain.com',
    ],
    ['same-origin url', '/api/v4/users?id=123', '/api/v4/users'],
    ['url with port 8080', 'http://172.31.12.144:8080/test', 'http://172.31.12.144:8080/test'],
    ['url with port 4433', 'http://172.31.12.144:4433/test', 'http://172.31.12.144:4433/test'],
    ['url with port 443', 'http://172.31.12.144:443/test', 'http://172.31.12.144/test'],
    ['url with IP and port 80', 'http://172.31.12.144:80/test', 'http://172.31.12.144/test'],
  ])('returns a sanitized URL for a %s', (_, rawUrl: string, sanitizedURL: string) => {
    const urlObject = parseUrl(rawUrl);
    expect(getSanitizedUrlString(urlObject)).toEqual(sanitizedURL);
  });
});

describe('parseUrl', () => {
  it.each([
    [
      'https://somedomain.com',
      { host: 'somedomain.com', path: '', search: '', hash: '', protocol: 'https', relative: '' },
    ],
    [
      'https://somedomain.com/path/to/happiness',
      {
        host: 'somedomain.com',
        path: '/path/to/happiness',
        search: '',
        hash: '',
        protocol: 'https',
        relative: '/path/to/happiness',
      },
    ],
    [
      'https://somedomain.com/path/to/happiness?auhtToken=abc123&param2=bar',
      {
        host: 'somedomain.com',
        path: '/path/to/happiness',
        search: '?auhtToken=abc123&param2=bar',
        hash: '',
        protocol: 'https',
        relative: '/path/to/happiness?auhtToken=abc123&param2=bar',
      },
    ],
    [
      'https://somedomain.com/path/to/happiness?auhtToken=abc123&param2=bar#wildfragment',
      {
        host: 'somedomain.com',
        path: '/path/to/happiness',
        search: '?auhtToken=abc123&param2=bar',
        hash: '#wildfragment',
        protocol: 'https',
        relative: '/path/to/happiness?auhtToken=abc123&param2=bar#wildfragment',
      },
    ],
    [
      'https://somedomain.com/path/to/happiness#somewildfragment123',
      {
        host: 'somedomain.com',
        path: '/path/to/happiness',
        search: '',
        hash: '#somewildfragment123',
        protocol: 'https',
        relative: '/path/to/happiness#somewildfragment123',
      },
    ],
    [
      'https://somedomain.com/path/to/happiness#somewildfragment123?auhtToken=abc123&param2=bar',
      {
        host: 'somedomain.com',
        path: '/path/to/happiness',
        search: '',
        hash: '#somewildfragment123?auhtToken=abc123&param2=bar',
        protocol: 'https',
        relative: '/path/to/happiness#somewildfragment123?auhtToken=abc123&param2=bar',
      },
    ],
    [
      // yup, this is a valid URL (protocol-agnostic URL)
      '//somedomain.com/path/to/happiness?auhtToken=abc123&param2=bar#wildfragment',
      {
        host: 'somedomain.com',
        path: '/path/to/happiness',
        search: '?auhtToken=abc123&param2=bar',
        hash: '#wildfragment',
        protocol: undefined,
        relative: '/path/to/happiness?auhtToken=abc123&param2=bar#wildfragment',
      },
    ],
    ['', {}],
    [
      '\n',
      {
        hash: '',
        host: undefined,
        path: '\n',
        protocol: undefined,
        relative: '\n',
        search: '',
      },
    ],
    [
      'somerandomString',
      {
        hash: '',
        host: undefined,
        path: 'somerandomString',
        protocol: undefined,
        relative: 'somerandomString',
        search: '',
      },
    ],
    [
      'somedomain.com',
      {
        host: undefined,
        path: 'somedomain.com',
        search: '',
        hash: '',
        protocol: undefined,
        relative: 'somedomain.com',
      },
    ],
    [
      'somedomain.com/path/?q=1#fragment',
      {
        host: undefined,
        path: 'somedomain.com/path/',
        search: '?q=1',
        hash: '#fragment',
        protocol: undefined,
        relative: 'somedomain.com/path/?q=1#fragment',
      },
    ],
  ])('returns parsed partial URL object for %s', (url: string, expected: any) => {
    expect(parseUrl(url)).toEqual(expected);
  });
});

describe('parseStringToURLObject', () => {
  it.each([
    [
      'invalid URL',
      'invalid-url',
      {
        isRelative: true,
        pathname: '/invalid-url',
        search: '',
        hash: '',
      },
    ],
    ['valid absolute URL', 'https://somedomain.com', expect.any(URL)],
    ['valid absolute URL with base', 'https://somedomain.com', expect.any(URL), 'https://base.com'],
    [
      'relative URL',
      '/path/to/happiness',
      {
        isRelative: true,
        pathname: '/path/to/happiness',
        search: '',
        hash: '',
      },
    ],
    [
      'relative URL with query',
      '/path/to/happiness?q=1',
      {
        isRelative: true,
        pathname: '/path/to/happiness',
        search: '?q=1',
        hash: '',
      },
    ],
    [
      'relative URL with hash',
      '/path/to/happiness#section',
      {
        isRelative: true,
        pathname: '/path/to/happiness',
        search: '',
        hash: '#section',
      },
    ],
    [
      'relative URL with query and hash',
      '/path/to/happiness?q=1#section',
      {
        isRelative: true,
        pathname: '/path/to/happiness',
        search: '?q=1',
        hash: '#section',
      },
    ],
    ['URL with port', 'https://somedomain.com:8080/path', expect.any(URL)],
    ['URL with auth', 'https://user:pass@somedomain.com', expect.any(URL)],
    ['URL with special chars', 'https://somedomain.com/path/with spaces/and/special@chars', expect.any(URL)],
    ['URL with unicode', 'https://somedomain.com/path/with/unicode/测试', expect.any(URL)],
    ['URL with multiple query params', 'https://somedomain.com/path?q1=1&q2=2&q3=3', expect.any(URL)],
    ['URL with encoded chars', 'https://somedomain.com/path/%20%2F%3F%23', expect.any(URL)],
    ['URL with IPv4', 'https://192.168.1.1/path', expect.any(URL)],
    ['URL with IPv6', 'https://[2001:db8::1]/path', expect.any(URL)],
    ['URL with subdomain', 'https://sub.somedomain.com/path', expect.any(URL)],
    ['URL with multiple subdomains', 'https://sub1.sub2.somedomain.com/path', expect.any(URL)],
    ['URL with trailing slash', 'https://somedomain.com/path/', expect.any(URL)],
    ['URL with empty path', 'https://somedomain.com', expect.any(URL)],
    ['URL with root path', 'https://somedomain.com/', expect.any(URL)],
    ['URL with file extension', 'https://somedomain.com/path/file.html', expect.any(URL)],
    ['URL with custom protocol', 'custom://somedomain.com/path', expect.any(URL)],
    ['URL with query containing special chars', 'https://somedomain.com/path?q=hello+world&x=1/2', expect.any(URL)],
    ['URL with hash containing special chars', 'https://somedomain.com/path#section/1/2', expect.any(URL)],
    [
      'URL with all components',
      'https://user:pass@sub.somedomain.com:8080/path/file.html?q=1#section',
      expect.any(URL),
    ],
  ])('handles %s', (_, url: string, expected: any, base?: string) => {
    expect(parseStringToURLObject(url, base)).toEqual(expected);
  });

  it('does not throw an error if URL.canParse is not defined', () => {
    const canParse = (URL as any).canParse;
    delete (URL as any).canParse;
    expect(parseStringToURLObject('https://somedomain.com')).toBeInstanceOf(URL);
    (URL as any).canParse = canParse;
  });
});

describe('isURLObjectRelative', () => {
  it('returns true for relative URLs', () => {
    expect(isURLObjectRelative(parseStringToURLObject('/path/to/happiness')!)).toBe(true);
  });

  it('returns false for absolute URLs', () => {
    expect(isURLObjectRelative(parseStringToURLObject('https://somedomain.com')!)).toBe(false);
  });
});

describe('getSanitizedUrlStringFromUrlObject', () => {
  it.each([
    ['regular url', 'https://somedomain.com', 'https://somedomain.com/'],
    ['regular url with a path', 'https://somedomain.com/path/to/happiness', 'https://somedomain.com/path/to/happiness'],
    [
      'url with standard http port 80',
      'http://somedomain.com:80/path/to/happiness',
      'http://somedomain.com/path/to/happiness',
    ],
    [
      'url with standard https port 443',
      'https://somedomain.com:443/path/to/happiness',
      'https://somedomain.com/path/to/happiness',
    ],
    [
      'url with non-standard port',
      'https://somedomain.com:4200/path/to/happiness',
      'https://somedomain.com:4200/path/to/happiness',
    ],
    [
      'url with query params',
      'https://somedomain.com:4200/path/to/happiness?auhtToken=abc123&param2=bar',
      'https://somedomain.com:4200/path/to/happiness',
    ],
    [
      'url with a fragment',
      'https://somedomain.com/path/to/happiness#somewildfragment123',
      'https://somedomain.com/path/to/happiness',
    ],
    [
      'url with a fragment and query params',
      'https://somedomain.com/path/to/happiness#somewildfragment123?auhtToken=abc123&param2=bar',
      'https://somedomain.com/path/to/happiness',
    ],
    [
      'url with authorization',
      'https://username:password@somedomain.com',
      'https://%filtered%:%filtered%@somedomain.com/',
    ],
    ['same-origin url', '/api/v4/users?id=123', '/api/v4/users'],
    ['url with port 8080', 'http://172.31.12.144:8080/test', 'http://172.31.12.144:8080/test'],
    ['url with port 4433', 'http://172.31.12.144:4433/test', 'http://172.31.12.144:4433/test'],
    ['url with port 443', 'http://172.31.12.144:443/test', 'http://172.31.12.144/test'],
    ['url with IP and port 80', 'http://172.31.12.144:80/test', 'http://172.31.12.144/test'],
    ['invalid URL', 'invalid-url', '/invalid-url'],
    ['valid absolute URL with base', 'https://somedomain.com', 'https://somedomain.com/'],
    ['relative URL', '/path/to/happiness', '/path/to/happiness'],
    ['relative URL with query', '/path/to/happiness?q=1', '/path/to/happiness'],
    ['relative URL with hash', '/path/to/happiness#section', '/path/to/happiness'],
    ['relative URL with query and hash', '/path/to/happiness?q=1#section', '/path/to/happiness'],
    [
      'URL with special chars',
      'https://somedomain.com/path/with spaces/and/special@chars',
      'https://somedomain.com/path/with%20spaces/and/special@chars',
    ],
    [
      'URL with unicode',
      'https://somedomain.com/path/with/unicode/测试',
      'https://somedomain.com/path/with/unicode/%E6%B5%8B%E8%AF%95',
    ],
    ['URL with multiple query params', 'https://somedomain.com/path?q1=1&q2=2&q3=3', 'https://somedomain.com/path'],
    ['URL with encoded chars', 'https://somedomain.com/path/%20%2F%3F%23', 'https://somedomain.com/path/%20%2F%3F%23'],
    ['URL with IPv4', 'https://192.168.1.1/path', 'https://192.168.1.1/path'],
    ['URL with IPv6', 'https://[2001:db8::1]/path', 'https://[2001:db8::1]/path'],
    ['URL with subdomain', 'https://sub.somedomain.com/path', 'https://sub.somedomain.com/path'],
    ['URL with multiple subdomains', 'https://sub1.sub2.somedomain.com/path', 'https://sub1.sub2.somedomain.com/path'],
    ['URL with trailing slash', 'https://somedomain.com/path/', 'https://somedomain.com/path/'],
    ['URL with empty path', 'https://somedomain.com', 'https://somedomain.com/'],
    ['URL with root path', 'https://somedomain.com/', 'https://somedomain.com/'],
    ['URL with file extension', 'https://somedomain.com/path/file.html', 'https://somedomain.com/path/file.html'],
    ['URL with custom protocol', 'custom://somedomain.com/path', 'custom://somedomain.com/path'],
    [
      'URL with query containing special chars',
      'https://somedomain.com/path?q=hello+world&x=1/2',
      'https://somedomain.com/path',
    ],
    [
      'URL with hash containing special chars',
      'https://somedomain.com/path#section/1/2',
      'https://somedomain.com/path',
    ],
    [
      'URL with all components',
      'https://user:pass@sub.somedomain.com:8080/path/file.html?q=1#section',
      'https://%filtered%:%filtered%@sub.somedomain.com:8080/path/file.html',
    ],
  ])('returns a sanitized URL for a %s', (_, rawUrl: string, sanitizedURL: string) => {
    const urlObject = parseStringToURLObject(rawUrl);
    if (!urlObject) {
      throw new Error('Invalid URL');
    }
    expect(getSanitizedUrlStringFromUrlObject(urlObject)).toEqual(sanitizedURL);
  });
});

describe('getHttpSpanDetailsFromUrlObject', () => {
  it('handles undefined URL object', () => {
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(undefined, 'server', 'test-origin');
    expect(name).toBe('GET /');
    expect(attributes).toEqual({
      'sentry.origin': 'test-origin',
      'sentry.source': 'url',
    });
  });

  it('handles relative URL object', () => {
    const urlObject = parseStringToURLObject('/api/users')!;
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(urlObject, 'server', 'test-origin');
    expect(name).toBe('GET /api/users');
    expect(attributes).toEqual({
      'sentry.origin': 'test-origin',
      'sentry.source': 'url',
      'url.path': '/api/users',
    });
  });

  it('handles absolute URL object', () => {
    const urlObject = parseStringToURLObject('https://example.com/api/users?q=test#section')!;
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(urlObject, 'server', 'test-origin');
    expect(name).toBe('GET /api/users');
    expect(attributes).toEqual({
      'sentry.origin': 'test-origin',
      'sentry.source': 'url',
      'url.path': '/api/users',
      'url.query': '?q=test',
      'url.fragment': '#section',
      'url.full': 'https://example.com/api/users?q=test#section',
      'server.address': 'example.com',
      'url.scheme': 'https:',
    });
  });

  it('handles URL object with request method', () => {
    const urlObject = parseStringToURLObject('https://example.com/api/users')!;
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(urlObject, 'server', 'test-origin', { method: 'POST' });
    expect(name).toBe('POST /api/users');
    expect(attributes).toEqual({
      'sentry.origin': 'test-origin',
      'sentry.source': 'url',
      'url.path': '/api/users',
      'url.full': 'https://example.com/api/users',
      'server.address': 'example.com',
      'url.scheme': 'https:',
      'http.request.method': 'POST',
    });
  });

  it('handles URL object with route name', () => {
    const urlObject = parseStringToURLObject('https://example.com/api/users')!;
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(
      urlObject,
      'server',
      'test-origin',
      undefined,
      '/api/users/:id',
    );
    expect(name).toBe('GET /api/users/:id');
    expect(attributes).toEqual({
      'sentry.origin': 'test-origin',
      'sentry.source': 'route',
      'url.path': '/api/users',
      'url.full': 'https://example.com/api/users',
      'server.address': 'example.com',
      'url.scheme': 'https:',
      'http.route': '/api/users/:id',
    });
  });

  it('handles root path URL', () => {
    const urlObject = parseStringToURLObject('https://example.com/')!;
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(urlObject, 'server', 'test-origin');
    expect(name).toBe('GET /');
    expect(attributes).toEqual({
      'sentry.origin': 'test-origin',
      'sentry.source': 'route',
      'url.path': '/',
      'url.full': 'https://example.com/',
      'server.address': 'example.com',
      'url.scheme': 'https:',
    });
  });

  it('handles URL with port', () => {
    const urlObject = parseStringToURLObject('https://example.com:8080/api/users')!;
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(urlObject, 'server', 'test-origin');
    expect(name).toBe('GET /api/users');
    expect(attributes).toEqual({
      'sentry.origin': 'test-origin',
      'sentry.source': 'url',
      'url.path': '/api/users',
      'url.full': 'https://example.com:8080/api/users',
      'server.address': 'example.com',
      'url.scheme': 'https:',
      'url.port': '8080',
    });
  });

  it('handles URL with non-standard port and request method', () => {
    const urlObject = parseStringToURLObject('https://example.com:3000/api/users')!;
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(urlObject, 'server', 'test-origin', { method: 'PUT' });
    expect(name).toBe('PUT /api/users');
    expect(attributes).toEqual({
      'sentry.origin': 'test-origin',
      'sentry.source': 'url',
      'url.path': '/api/users',
      'url.full': 'https://example.com:3000/api/users',
      'server.address': 'example.com',
      'url.scheme': 'https:',
      'url.port': '3000',
      'http.request.method': 'PUT',
    });
  });

  it('handles URL with route name and request method', () => {
    const urlObject = parseStringToURLObject('https://example.com/api/users/123')!;
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(
      urlObject,
      'server',
      'test-origin',
      { method: 'PATCH' },
      '/api/users/:id',
    );
    expect(name).toBe('PATCH /api/users/:id');
    expect(attributes).toEqual({
      'sentry.origin': 'test-origin',
      'sentry.source': 'route',
      'url.path': '/api/users/123',
      'url.full': 'https://example.com/api/users/123',
      'server.address': 'example.com',
      'url.scheme': 'https:',
      'http.route': '/api/users/:id',
      'http.request.method': 'PATCH',
    });
  });

  it('handles URL with query params and route name', () => {
    const urlObject = parseStringToURLObject('https://example.com/api/search?q=test&page=1')!;
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(
      urlObject,
      'server',
      'test-origin',
      undefined,
      '/api/search',
    );
    expect(name).toBe('GET /api/search');
    expect(attributes).toEqual({
      'sentry.origin': 'test-origin',
      'sentry.source': 'route',
      'url.path': '/api/search',
      'url.query': '?q=test&page=1',
      'url.full': 'https://example.com/api/search?q=test&page=1',
      'server.address': 'example.com',
      'url.scheme': 'https:',
      'http.route': '/api/search',
    });
  });

  it('handles URL with fragment and route name', () => {
    const urlObject = parseStringToURLObject('https://example.com/api/docs#section-1')!;
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(
      urlObject,
      'server',
      'test-origin',
      undefined,
      '/api/docs',
    );
    expect(name).toBe('GET /api/docs');
    expect(attributes).toEqual({
      'sentry.origin': 'test-origin',
      'sentry.source': 'route',
      'url.path': '/api/docs',
      'url.fragment': '#section-1',
      'url.full': 'https://example.com/api/docs#section-1',
      'server.address': 'example.com',
      'url.scheme': 'https:',
      'http.route': '/api/docs',
    });
  });

  it('handles URL with auth credentials', () => {
    const urlObject = parseStringToURLObject('https://user:pass@example.com/api/users')!;
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(urlObject, 'server', 'test-origin');
    expect(name).toBe('GET /api/users');
    expect(attributes).toEqual({
      'sentry.origin': 'test-origin',
      'sentry.source': 'url',
      'url.path': '/api/users',
      'url.full': 'https://user:pass@example.com/api/users',
      'server.address': 'example.com',
      'url.scheme': 'https:',
    });
  });

  it('handles URL with IPv4 address', () => {
    const urlObject = parseStringToURLObject('https://192.168.1.1:8080/api/users')!;
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(urlObject, 'server', 'test-origin');
    expect(name).toBe('GET /api/users');
    expect(attributes).toEqual({
      'sentry.origin': 'test-origin',
      'sentry.source': 'url',
      'url.path': '/api/users',
      'url.full': 'https://192.168.1.1:8080/api/users',
      'server.address': '192.168.1.1',
      'url.scheme': 'https:',
      'url.port': '8080',
    });
  });

  it('handles URL with IPv6 address', () => {
    const urlObject = parseStringToURLObject('https://[2001:db8::1]:8080/api/users')!;
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(urlObject, 'server', 'test-origin');
    expect(name).toBe('GET /api/users');
    expect(attributes).toEqual({
      'sentry.origin': 'test-origin',
      'sentry.source': 'url',
      'url.path': '/api/users',
      'url.full': 'https://[2001:db8::1]:8080/api/users',
      'server.address': '[2001:db8::1]',
      'url.scheme': 'https:',
      'url.port': '8080',
    });
  });

  it('handles URL with subdomain', () => {
    const urlObject = parseStringToURLObject('https://api.example.com/users')!;
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(urlObject, 'server', 'test-origin');
    expect(name).toBe('GET /users');
    expect(attributes).toEqual({
      'sentry.origin': 'test-origin',
      'sentry.source': 'url',
      'url.path': '/users',
      'url.full': 'https://api.example.com/users',
      'server.address': 'api.example.com',
      'url.scheme': 'https:',
    });
  });
});

describe('stripDataUrlContent', () => {
  it('returns regular URLs unchanged', () => {
    expect(stripDataUrlContent('https://example.com/api')).toBe('https://example.com/api');
    expect(stripDataUrlContent('http://localhost:3000/test')).toBe('http://localhost:3000/test');
    expect(stripDataUrlContent('/relative/path')).toBe('/relative/path');
  });

  it('should be applied BEFORE parseStringToURLObject for data URLs', () => {
    // This test documents an important behavior:
    // Data URLs are treated as "relative" by parseStringToURLObject because they don't contain "://".
    // This means getSanitizedUrlStringFromUrlObject returns just the pathname (without "data:" prefix),
    // and stripDataUrlContent won't match since it checks url.startsWith('data:').
    // Therefore, stripDataUrlContent MUST be applied to the original URL before parsing.
    const dataUrl = 'data:text/javascript;base64,SGVsbG8gV29ybGQ=';

    // Verify data URLs are treated as relative
    const parsedUrl = parseStringToURLObject(dataUrl);
    expect(parsedUrl).toBeDefined();
    expect(isURLObjectRelative(parsedUrl!)).toBe(true);

    // getSanitizedUrlStringFromUrlObject returns just the pathname for relative URLs
    const sanitizedWithoutStripping = getSanitizedUrlStringFromUrlObject(parsedUrl!);
    // The pathname doesn't start with 'data:', so stripDataUrlContent wouldn't work on it
    expect(sanitizedWithoutStripping.startsWith('data:')).toBe(false);
    // Applying stripDataUrlContent AFTER parsing is ineffective
    expect(stripDataUrlContent(sanitizedWithoutStripping)).toBe(sanitizedWithoutStripping);

    // CORRECT approach: strip data URL content FIRST, before any URL parsing
    const strippedUrl = stripDataUrlContent(dataUrl);
    // Default behavior includes first 10 chars of data for debugging (e.g., magic bytes)
    expect(strippedUrl).toBe('data:text/javascript,base64,SGVsbG8gV2... [truncated]');
    // The stripped URL is already sanitized and can be used directly as the span name
  });

  describe('with includeDataPrefix=true (default)', () => {
    it('includes first 10 chars of data for base64 data URLs', () => {
      // SGVsbG8gV29ybGQ= is "Hello World" in base64
      expect(stripDataUrlContent('data:text/javascript;base64,SGVsbG8gV29ybGQ=')).toBe(
        'data:text/javascript,base64,SGVsbG8gV2... [truncated]',
      );
      expect(stripDataUrlContent('data:application/json;base64,eyJrZXkiOiJ2YWx1ZSJ9')).toBe(
        'data:application/json,base64,eyJrZXkiOi... [truncated]',
      );
    });

    it('includes first 10 chars of data for non-base64 data URLs', () => {
      expect(stripDataUrlContent('data:text/plain,Hello%20World')).toBe('data:text/plain,Hello%20Wo... [truncated]');
      expect(stripDataUrlContent('data:text/html,<h1>Hello</h1>')).toBe('data:text/html,<h1>Hello<... [truncated]');
    });

    it('includes all data if less than 10 chars', () => {
      expect(stripDataUrlContent('data:text/plain,Hi')).toBe('data:text/plain,Hi');
      expect(stripDataUrlContent('data:text/plain;base64,SGk=')).toBe('data:text/plain,base64,SGk=');
    });

    it('helps identify WASM by magic bytes (AGFzbQ)', () => {
      // WASM magic bytes: \0asm -> base64: AGFzbQ
      const wasmDataUrl = 'data:application/wasm;base64,AGFzbQEAAAA=';
      expect(stripDataUrlContent(wasmDataUrl)).toBe('data:application/wasm,base64,AGFzbQEAAA... [truncated]');
    });

    it('handles various MIME types', () => {
      expect(stripDataUrlContent('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA')).toBe(
        'data:image/png,base64,iVBORw0KGg... [truncated]',
      );
      expect(stripDataUrlContent('data:image/svg+xml;base64,PHN2Zz4=')).toBe('data:image/svg+xml,base64,PHN2Zz4=');
    });

    it('defaults to text/plain for data URLs without MIME type', () => {
      expect(stripDataUrlContent('data:,Hello')).toBe('data:text/plain,Hello');
      expect(stripDataUrlContent('data:;base64,SGVsbG8=')).toBe('data:text/plain,base64,SGVsbG8=');
    });

    it('handles empty data URLs', () => {
      expect(stripDataUrlContent('data:')).toBe('data:text/plain');
    });

    it('handles very long base64 encoded data URLs', () => {
      const longBase64 = 'A'.repeat(10000);
      expect(stripDataUrlContent(`data:text/javascript;base64,${longBase64}`)).toBe(
        'data:text/javascript,base64,AAAAAAAAAA... [truncated]',
      );
    });
  });

  describe('with includeDataPrefix=false', () => {
    it('strips all content from base64 data URLs', () => {
      expect(stripDataUrlContent('data:text/javascript;base64,SGVsbG8gV29ybGQ=', false)).toBe(
        'data:text/javascript,base64',
      );
      expect(stripDataUrlContent('data:application/json;base64,eyJrZXkiOiJ2YWx1ZSJ9', false)).toBe(
        'data:application/json,base64',
      );
    });

    it('strips all content from non-base64 data URLs', () => {
      expect(stripDataUrlContent('data:text/plain,Hello%20World', false)).toBe('data:text/plain');
      expect(stripDataUrlContent('data:text/html,<h1>Hello</h1>', false)).toBe('data:text/html');
    });

    it('handles various MIME types', () => {
      expect(stripDataUrlContent('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA', false)).toBe(
        'data:image/png,base64',
      );
      expect(stripDataUrlContent('data:application/wasm;base64,AGFzbQEAAAA=', false)).toBe(
        'data:application/wasm,base64',
      );
    });

    it('defaults to text/plain for data URLs without MIME type', () => {
      expect(stripDataUrlContent('data:,Hello', false)).toBe('data:text/plain');
      expect(stripDataUrlContent('data:;base64,SGVsbG8=', false)).toBe('data:text/plain,base64');
    });
  });
});
