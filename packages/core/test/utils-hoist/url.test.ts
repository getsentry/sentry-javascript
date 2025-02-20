import { getSanitizedUrlString, parseUrl, stripUrlQueryAndFragment } from '../../src/utils-hoist/url';

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
    ['url without a protocol', 'example.com', 'example.com'],
    ['url without a protocol with a path', 'example.com/sub/path?id=123', 'example.com/sub/path'],
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
